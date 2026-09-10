// Minimal RFB client (RFC 6143 — "The Remote Framebuffer Protocol", the VNC wire protocol):
// completes the handshake and sends PointerEvent/KeyEvent only. Never requests a framebuffer
// update, so it never has to decode pixel data (Raw/Hextile/ZRLE/Tight...) — see ADR-HEARTH-033
// for why that's the right scope for "phone as input device," not a corner cut: a spec-compliant
// server never sends a FramebufferUpdate unless the client asks for one. Security type "None"
// only — trusts the Family Command Center's own relay for auth (ADR-HEARTH-011), not a second
// VNC password (VNC Authentication's DES challenge-response is a documented gap, not built here).
//
// Connects through a WebSocket, not a raw TCP socket: React Native/Expo Go has no TCP socket API,
// so the transport is expected to be a `websockify`-style WebSocket<->TCP bridge (proposed as a
// new endpoint on the Family Command Center's relay, not a public/direct VNC port).

const CLIENT_VERSION = "RFB 003.008\n";
const SECURITY_TYPE_NONE = 1;

export interface RfbServerInfo {
  width: number;
  height: number;
  name: string;
}

export class RfbProtocolError extends Error {}

/** Bits in RFB's PointerEvent button-mask (RFC 6143 §7.5.5) — combine with `|` for a multi-button chord. */
export const RfbButton = {
  Left: 1 << 0,
  Middle: 1 << 1,
  Right: 1 << 2,
} as const;

function readU16(bytes: Uint8Array, offset = 0): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readU32(bytes: Uint8Array, offset = 0): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function writeU16(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >> 8) & 0xff;
  target[offset + 1] = value & 0xff;
}

function writeU32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

interface PendingRead {
  length: number;
  resolve: (bytes: Uint8Array) => void;
  reject: (err: Error) => void;
}

/**
 * One RFB session over a WebSocket. RFB is a byte-stream protocol layered on WebSocket's
 * message-framed transport, so a single incoming WS message can contain a partial RFB message,
 * several of them, or split a multi-byte field across a message boundary — `readBytes` maintains
 * its own reassembly buffer rather than assuming any alignment between the two.
 */
export class RfbClient {
  private ws: WebSocket | null = null;
  private buffer = new Uint8Array(0);
  private pendingRead: PendingRead | null = null;
  private closed = false;

  constructor(private websocketUrl: string) {}

  async connect(): Promise<RfbServerInfo> {
    await this.openSocket();
    await this.negotiateVersion();
    await this.negotiateSecurity();
    this.sendClientInit();
    return this.readServerInit();
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.websocketUrl);
      ws.binaryType = "arraybuffer";
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new RfbProtocolError(`Could not connect to ${this.websocketUrl}`));
      ws.onclose = () => {
        this.closed = true;
        if (this.pendingRead) {
          this.pendingRead.reject(new RfbProtocolError("Connection closed while waiting for data"));
          this.pendingRead = null;
        }
      };
      ws.onmessage = (event) => this.onData(event.data as ArrayBuffer);
      this.ws = ws;
    });
  }

  private onData(data: ArrayBuffer): void {
    const incoming = new Uint8Array(data);
    const combined = new Uint8Array(this.buffer.length + incoming.length);
    combined.set(this.buffer, 0);
    combined.set(incoming, this.buffer.length);
    this.buffer = combined;
    this.tryResolvePendingRead();
  }

  private tryResolvePendingRead(): void {
    if (!this.pendingRead || this.buffer.length < this.pendingRead.length) return;
    const { length, resolve } = this.pendingRead;
    this.pendingRead = null;
    resolve(this.takeBytes(length));
  }

  private takeBytes(length: number): Uint8Array {
    const result = this.buffer.slice(0, length);
    this.buffer = this.buffer.slice(length);
    return result;
  }

  private readBytes(length: number): Promise<Uint8Array> {
    if (this.closed) return Promise.reject(new RfbProtocolError("Connection is closed"));
    if (this.buffer.length >= length) return Promise.resolve(this.takeBytes(length));
    return new Promise((resolve, reject) => {
      this.pendingRead = { length, resolve, reject };
    });
  }

  private send(bytes: Uint8Array): void {
    if (!this.ws || this.closed) throw new RfbProtocolError("Not connected");
    this.ws.send(bytes);
  }

  private async negotiateVersion(): Promise<void> {
    const serverVersion = await this.readBytes(12);
    const versionString = new TextDecoder().decode(serverVersion);
    if (!versionString.startsWith("RFB 0")) {
      throw new RfbProtocolError(`Unexpected RFB version handshake: ${versionString}`);
    }
    this.send(new TextEncoder().encode(CLIENT_VERSION));
  }

  private async negotiateSecurity(): Promise<void> {
    const countByte = await this.readBytes(1);
    const count = countByte[0];
    if (count === 0) {
      // RFC 6143 §7.1.2: a count of 0 means the connection failed; a reason string follows
      // instead of a security-type list.
      const reasonLength = readU32(await this.readBytes(4));
      const reason = new TextDecoder().decode(await this.readBytes(reasonLength));
      throw new RfbProtocolError(`Server rejected the connection: ${reason}`);
    }
    const types = await this.readBytes(count);
    if (!types.includes(SECURITY_TYPE_NONE)) {
      throw new RfbProtocolError(
        "Server requires VNC Authentication, which isn't supported yet (ADR-HEARTH-033) — only security type 'None' is implemented"
      );
    }
    this.send(new Uint8Array([SECURITY_TYPE_NONE]));

    const result = readU32(await this.readBytes(4));
    if (result !== 0) {
      const reasonLength = readU32(await this.readBytes(4));
      const reason = new TextDecoder().decode(await this.readBytes(reasonLength));
      throw new RfbProtocolError(`Security handshake failed: ${reason}`);
    }
  }

  private sendClientInit(): void {
    // shared-flag = 1: let other clients (a physical keyboard/mouse, another paired phone) stay
    // connected too — see ADR-HEARTH-033's "multiple phones, and physical peripherals, all at
    // once" section. This is the protocol's own mechanism for that, not a Hearth-side choice to
    // revisit later.
    this.send(new Uint8Array([1]));
  }

  private async readServerInit(): Promise<RfbServerInfo> {
    const header = await this.readBytes(24); // width(2) + height(2) + pixel-format(16) + name-length(4)
    const width = readU16(header, 0);
    const height = readU16(header, 2);
    // Pixel format (header[4..20], RFC 6143 §7.4) is intentionally unread — this client never
    // decodes pixel data (see the file header comment).
    const nameLength = readU32(header, 20);
    const name = new TextDecoder().decode(await this.readBytes(nameLength));
    return { width, height, name };
  }

  /** Sends one PointerEvent (RFC 6143 §7.5.5). `x`/`y` are absolute framebuffer coordinates, clamped to the server's reported resolution by the caller — this method just encodes and sends. */
  sendPointerEvent(x: number, y: number, buttonMask: number): void {
    const message = new Uint8Array(6);
    message[0] = 5; // message-type: PointerEvent
    message[1] = buttonMask;
    writeU16(message, 2, Math.round(x));
    writeU16(message, 4, Math.round(y));
    this.send(message);
  }

  /** Sends one KeyEvent (RFC 6143 §7.5.4). `keysym` is an X11 keysym (see keysym.ts) — the RFB wire format, not a raw scancode or JS key name. Callers send a down (`true`) then up (`false`) pair per keypress, the same way a physical key does. */
  sendKeyEvent(keysym: number, down: boolean): void {
    const message = new Uint8Array(8);
    message[0] = 4; // message-type: KeyEvent
    message[1] = down ? 1 : 0;
    // bytes 2-3: padding, left zero
    writeU32(message, 4, keysym);
    this.send(message);
  }

  disconnect(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }
}
