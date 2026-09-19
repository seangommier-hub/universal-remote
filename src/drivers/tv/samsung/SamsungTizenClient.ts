// Thin client for the unencrypted Samsung Tizen remote-control WebSocket protocol
// (ws://<ip>:8001/api/v2/channels/samsung.remote.control). This is an unofficial,
// community-reverse-engineered protocol (no first-party Samsung documentation for this
// direction of control) — verified against the widely-used reference implementation
// https://github.com/xchwarze/samsung-tv-ws-api (connection.py, event.py, COMMANDS.md).
// See ADR-HEARTH-005 for why this targets only the unencrypted port, not wss://8002. See
// ADR-HEARTH-011: if the TV isn't reachable directly (different network segment than the
// phone), connect() falls back to relaying through Family Command Center.

import { openSocketWithRelayFallback } from "../../../core/network/wsRelayFallback";
import { requestWithRelayFallback } from "../../../core/network/httpRelayFallback";

const CONNECT_TIMEOUT_MS = 20000; // only hit on a first-time pairing, which needs a physical on-screen approval tap
const MS_CHANNEL_CONNECT_EVENT = "ms.channel.connect";
const MS_CHANNEL_UNAUTHORIZED_EVENT = "ms.channel.unauthorized";

export interface SamsungTizenConfig {
  ipAddress: string;
  appName?: string;
  /** A token from a previous successful pairing, if one is known. Sent back as a `?token=`
   * query param on the connection URL lets the TV recognize this client without re-showing the
   * on-screen Allow/Deny prompt — same mechanism as LgWebOsClient's `clientKey` (see
   * ADR-HEARTH-021), verified against this file's own reference implementation
   * (xchwarze/samsung-tv-ws-api's connection.py, which does exactly this). */
  token?: string;
}

export class SamsungPairingError extends Error {}

/** See LgWebOsClient.ts's identical LgUnreachableError — thrown specifically when the socket never opens at all (as opposed to opening fine but pairing timing out), so the driver can tell "wrong/stale IP" apart from "reachable but not yet approved" and know whether re-discovering the device's current address could help. */
export class SamsungUnreachableError extends Error {}

function encodeAsciiBase64(input: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < input.length; i += 3) {
    const b0 = input.charCodeAt(i);
    const b1 = input.charCodeAt(i + 1);
    const b2 = input.charCodeAt(i + 2);
    output += chars[b0 >> 2];
    output += chars[((b0 & 3) << 4) | (isNaN(b1) ? 0 : b1 >> 4)];
    output += isNaN(b1) ? "=" : chars[((b1 & 15) << 2) | (isNaN(b2) ? 0 : b2 >> 6)];
    output += isNaN(b2) ? "=" : chars[b2 & 63];
  }
  return output;
}

/** Talks to one Samsung Tizen TV's unencrypted remote-control WebSocket channel. One instance per TV. */
export class SamsungTizenClient {
  private socket: WebSocket | null = null;
  /** Fired when the socket closes after a successful connect (not during pairing, and not from
   * a deliberate close()) — set by the driver to drive auto-reconnect. See SamsungTizenDriver.ts. */
  onDisconnect: (() => void) | null = null;
  private closingDeliberately = false;

  constructor(private config: SamsungTizenConfig) {}

  /** Resolves with whatever token the TV confirms (new, on a first-ever pairing, or the same one
   * echoed back on a returning client) — mirrors LgWebOsClient.connect()'s identical contract so
   * the driver can persist it the same way. A known token rides along as a `?token=` query param;
   * an unpaired device connects with none and gets prompted, exactly as before this existed. */
  async connect(): Promise<string | undefined> {
    const name = encodeAsciiBase64(this.config.appName ?? "Hearth");
    const tokenParam = this.config.token ? `&token=${this.config.token}` : "";
    const url = `ws://${this.config.ipAddress}:8001/api/v2/channels/samsung.remote.control?name=${name}${tokenParam}`;
    let socket: WebSocket;
    try {
      socket = await openSocketWithRelayFallback(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new SamsungUnreachableError(message);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.close();
        const message = this.config.token
          ? "This TV isn't recognizing a previous pairing anymore (its own settings may have been reset or updated) — accept the on-screen prompt to re-approve it"
          : "Timed out waiting for pairing approval on the TV — accept the on-screen prompt and try again";
        reject(new Error(message));
      }, CONNECT_TIMEOUT_MS);

      socket.onmessage = (event: { data: unknown }) => {
        let message: { event?: string; data?: { token?: string } };
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (message.event === MS_CHANNEL_CONNECT_EVENT) {
          clearTimeout(timeout);
          this.socket = socket;
          socket.onclose = () => {
            if (this.socket !== socket) return; // a newer connection already replaced this one
            this.socket = null;
            if (!this.closingDeliberately) this.onDisconnect?.();
          };
          const token = message.data?.token;
          resolve(typeof token === "string" && token.length > 0 ? token : this.config.token);
        } else if (message.event === MS_CHANNEL_UNAUTHORIZED_EVENT) {
          clearTimeout(timeout);
          socket.close();
          reject(new SamsungPairingError("Pairing was denied on the TV"));
        }
      };
      socket.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`Could not open a WebSocket to ${this.config.ipAddress}:8001`));
      };
    });
  }

  sendKey(keyCode: string): void {
    if (!this.socket || this.socket.readyState !== this.socket.OPEN) {
      throw new Error("Samsung WebSocket is not connected — call connect() first");
    }
    this.socket.send(
      JSON.stringify({
        method: "ms.remote.control",
        params: { Cmd: "Click", DataOfCmd: keyCode, Option: "false", TypeOfRemote: "SendRemoteKey" },
      })
    );
  }

  close(): void {
    this.closingDeliberately = true;
    this.socket?.close();
    this.socket = null;
  }

  /** Real device name suggestion (2026-09-19, ADR-HEARTH-096): a plain, unauthenticated HTTP GET
   * to `http://<ip>:8001/api/v2/` — a separate endpoint from the remote-control WebSocket channel
   * above, needs no pairing. Verified against Home Assistant's `samsungtv` integration
   * (`config_flow.py`, an actively-maintained project): the response is `{"device": {"name": "[TV]
   * <the name the user set>", ...}}`, and HA itself strips the `"[TV] "` prefix the same way this
   * does — that prefix is a fixed protocol artifact, not part of the real name. */
  async getDeviceName(): Promise<string | undefined> {
    const response = await requestWithRelayFallback({ ip: this.config.ipAddress, port: 8001, path: "/api/v2/", method: "GET" });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { device?: { name?: string } };
    const rawName = body.device?.name;
    if (typeof rawName !== "string") return undefined;
    return rawName.replace(/^\[TV\]\s*/, "").trim() || undefined;
  }
}
