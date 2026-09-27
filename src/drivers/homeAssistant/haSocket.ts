const WEBSOCKET_PATH = "/api/websocket";
const AUTH_TIMEOUT_MS = 10_000;
const HTTPS_PREFIX = /^https:/i;
const HTTP_PREFIX = /^http:/i;

/** A message from Home Assistant after authentication; `id` routes it to the request or subscription it belongs to. */
export interface HaMessage {
  id?: number;
  type: string;
  [key: string]: unknown;
}

export interface HaSocketHandlers {
  onAuthenticated: () => void;
  onAuthInvalid: (message: string) => void;
  onMessage: (message: HaMessage) => void;
  /** The socket ended for any reason other than close() being called or the token being rejected. */
  onClosed: () => void;
}

/** Creates the underlying WebSocket, or null where the platform has none. */
export type HaSocketFactory = (url: string) => WebSocket | null;

const defaultSocketFactory: HaSocketFactory = (url) => (typeof WebSocket === "undefined" ? null : new WebSocket(url));

/** ws:// or wss:// address of a server's WebSocket API ("http://ha.local:8123" -> "ws://ha.local:8123/api/websocket"). */
export function webSocketUrlFor(baseUrl: string): string {
  return `${baseUrl.replace(HTTPS_PREFIX, "wss:").replace(HTTP_PREFIX, "ws:")}${WEBSOCKET_PATH}`;
}

/**
 * Transport plus the authentication handshake of Home Assistant's WebSocket API
 * (auth_required -> auth -> auth_ok | auth_invalid). The token is only ever sent in the auth message, never logged.
 */
export class HaSocket {
  private socket: WebSocket | null = null;
  private authenticated = false;
  private finished = false;
  private authTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly handlers: HaSocketHandlers,
    private readonly createSocket: HaSocketFactory = defaultSocketFactory
  ) {}

  /** Opens the connection; onAuthenticated fires once Home Assistant accepts the token. */
  open(): void {
    let socket: WebSocket | null = null;
    try {
      socket = this.createSocket(webSocketUrlFor(this.baseUrl));
    } catch {
      socket = null;
    }
    if (!socket) {
      queueMicrotask(() => this.fail());
      return;
    }
    this.socket = socket;
    socket.onmessage = (event) => this.handleRaw(String((event as { data: unknown }).data));
    socket.onerror = () => this.fail();
    socket.onclose = () => this.fail();
    this.authTimer = setTimeout(() => this.fail(), AUTH_TIMEOUT_MS);
  }

  /** Sends one JSON message; false when the socket is not open and authenticated. */
  send(message: Record<string, unknown>): boolean {
    if (!this.socket || !this.authenticated || this.finished) return false;
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  /** Closes for good without calling onClosed. */
  close(): void {
    this.finished = true;
    this.teardown();
  }

  private handleRaw(raw: string): void {
    if (this.finished) return;
    let message: HaMessage;
    try {
      message = JSON.parse(raw) as HaMessage;
    } catch {
      return;
    }
    if (this.authenticated) {
      this.handlers.onMessage(message);
      return;
    }
    this.handleAuthPhase(message);
  }

  private handleAuthPhase(message: HaMessage): void {
    if (message.type === "auth_required") {
      this.socket?.send(JSON.stringify({ type: "auth", access_token: this.token }));
    } else if (message.type === "auth_ok") {
      this.authenticated = true;
      this.clearAuthTimer();
      this.handlers.onAuthenticated();
    } else if (message.type === "auth_invalid") {
      this.finished = true;
      this.teardown();
      this.handlers.onAuthInvalid(typeof message.message === "string" ? message.message : "invalid access token");
    }
  }

  private fail(): void {
    if (this.finished) return;
    this.finished = true;
    this.teardown();
    this.handlers.onClosed();
  }

  private clearAuthTimer(): void {
    if (this.authTimer) clearTimeout(this.authTimer);
    this.authTimer = null;
  }

  private teardown(): void {
    this.clearAuthTimer();
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close();
    } catch {
      // closing a socket that is already gone is not an error
    }
  }
}
