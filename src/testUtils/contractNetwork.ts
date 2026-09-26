// A fake network shared by the driver contract suite (src/drivers/contract/*). Every driver in this
// app reaches its device through exactly two primitives, global `fetch` and global `WebSocket`, so
// faking those two (instead of each driver's own client module) lets ONE set of behavioral
// assertions run against every driver, and lets the suite catch bugs that live in the client layer
// (a request with no timeout) that per-driver client mocks can never see.
//
// Modes:
//   up      - devices answer. fetch replies come from the adapter's `responder`; sockets open and
//             speak the adapter's socket protocol.
//   refuse  - fast failure (connection refused / no route): fetch rejects, sockets fire onerror.
//   hang    - a black hole (device off, packets dropped): fetch never settles unless the caller
//             passes an AbortSignal and aborts it; sockets never open. This is the mode that catches
//             "no timeout" bugs.

import { MockWebSocket } from "./mockWebSocket";

export type NetworkMode = "up" | "hang" | "refuse";
export type SocketProtocol = "lg" | "samsung";

export interface FakeReply {
  json?: unknown;
  text?: string;
  status?: number;
}
export type Responder = (url: string, init: RequestInit | undefined) => FakeReply;

export interface FccConfig {
  baseUrl: string;
  token: string;
}

interface ContractNetworkState {
  mode: NetworkMode;
  /** What loadFamilyCommandCenterConfig() resolves to; undefined means "FCC not paired". */
  fccConfig: FccConfig | undefined;
  responder: Responder;
  socketProtocol: SocketProtocol | undefined;
  /** When true, already-open sockets stop answering (silent death) without firing onclose. */
  socketsDeaf: boolean;
  requestUrls: string[];
}

const NO_REPLY: Responder = () => ({ json: {} });

export const contractNetwork: ContractNetworkState = {
  mode: "up",
  fccConfig: undefined,
  responder: NO_REPLY,
  socketProtocol: undefined,
  socketsDeaf: false,
  requestUrls: [],
};

/** Total network attempts so far: HTTP requests plus sockets opened. */
export function networkAttemptCount(): number {
  return contractNetwork.requestUrls.length + MockWebSocket.instances.length;
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function hangUntilAborted(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(abortError()));
  });
}

function toResponse(reply: FakeReply): Response {
  const status = reply.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => reply.json ?? {},
    text: async () => reply.text ?? JSON.stringify(reply.json ?? {}),
  } as Response;
}

function fakeFetch(input: unknown, init?: RequestInit): Promise<Response> {
  const url = String(input);
  contractNetwork.requestUrls.push(url);
  if (contractNetwork.mode === "hang") return hangUntilAborted(init?.signal);
  if (contractNetwork.mode === "refuse") return Promise.reject(new TypeError("Network request failed"));
  return Promise.resolve(toResponse(contractNetwork.responder(url, init)));
}

/** Runs `action` after a few microtask turns, so handlers a caller assigns right after `new WebSocket()` are attached first. */
function afterHandlersAttached(action: () => void, turns = 8): void {
  let chain: Promise<void> = Promise.resolve();
  for (let turn = 0; turn < turns; turn++) chain = chain.then();
  void chain.then(action);
}

const LG_OK_PAYLOAD = { returnValue: true, volume: 15, mute: false, devices: [], launchPoints: [] };

/** A WebSocket whose behavior follows contractNetwork.mode and the adapter's socket protocol. */
export class ContractWebSocket extends MockWebSocket {
  constructor(url: string) {
    super(url);
    afterHandlersAttached(() => this.reactToNetwork());
  }

  private reactToNetwork(): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    if (contractNetwork.mode === "refuse") {
      this.onerror?.();
      return;
    }
    if (contractNetwork.mode === "hang") return;
    this.onopen?.();
    if (contractNetwork.socketProtocol === "samsung") {
      afterHandlersAttached(() => this.simulateMessage({ event: "ms.channel.connect", data: {} }));
    }
  }

  send(data: string): void {
    super.send(data);
    if (contractNetwork.mode !== "up" || contractNetwork.socketsDeaf) return;
    if (contractNetwork.socketProtocol !== "lg") return;
    const message = JSON.parse(data) as { type?: string; id?: string };
    afterHandlersAttached(() => {
      if (contractNetwork.socketsDeaf) return;
      if (message.type === "register") {
        this.simulateMessage({ type: "registered", id: message.id, payload: { "client-key": "contract-key" } });
      } else if (message.type === "request" || message.type === "subscribe") {
        this.simulateMessage({ type: "response", id: message.id, payload: LG_OK_PAYLOAD });
      }
    }, 1);
  }
}

/** Closes every socket the app has opened, the way a router reboot does (onclose fires). */
export function dropAllSockets(): void {
  for (const socket of MockWebSocket.instances) socket.close();
}

/** Installs the fake fetch/WebSocket and resets all state; call from beforeEach. */
export function installContractNetwork(): void {
  contractNetwork.mode = "up";
  contractNetwork.fccConfig = undefined;
  contractNetwork.responder = NO_REPLY;
  contractNetwork.socketProtocol = undefined;
  contractNetwork.socketsDeaf = false;
  contractNetwork.requestUrls = [];
  MockWebSocket.reset();
  (global as unknown as { fetch: unknown }).fetch = fakeFetch;
  (global as unknown as { WebSocket: unknown }).WebSocket = ContractWebSocket;
}
