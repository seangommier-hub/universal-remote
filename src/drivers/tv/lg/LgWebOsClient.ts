// Thin client for the LG webOS SSAP WebSocket protocol, encrypted port
// (wss://<ip>:3001, root path — no service suffix). Unofficial/community-reverse-engineered
// (no first-party LG doc for this direction of control) — verified against the widely-used
// reference implementation https://github.com/hobbyquaker/lgtv2 (index.js, pairing.json,
// README.md). See ADR-HEARTH-006: real-hardware testing (2026-09-09) confirmed Sean's TV
// (2023-or-later) rejects the unencrypted ws://3000 path outright, so this targets the
// encrypted port exclusively. React Native's own WebSocket cannot trust LG's private-CA
// certificate, so the direct-connect attempt below always fails for this port — that's
// expected and by design, not a bug: openSocketWithRelayFallback's fallback path is what
// actually succeeds, because Family Command Center's relay (plain Node.js, not React Native)
// CAN be configured to trust that certificate server-side. See ADR-HEARTH-014.

import { openSocketWithRelayFallback } from "../../../core/network/wsRelayFallback";

const CONNECT_TIMEOUT_MS = 30000; // the TV requires a physical on-screen approval tap
const PORT = 3001;
const SCHEME = "wss";

// Verbatim from https://github.com/hobbyquaker/lgtv2/blob/master/pairing.json — the exact
// manifest LG's own reference client sends. Do not trim fields; unrecognized/missing fields
// have caused pairing failures in community reports.
const PAIRING_MANIFEST = {
  forcePairing: false,
  pairingType: "PROMPT",
  manifest: {
    manifestVersion: 1,
    appVersion: "1.1",
    signed: {
      created: "20140509",
      appId: "com.lge.test",
      vendorId: "com.lge",
      localizedAppNames: {
        "": "LG Remote App",
        "ko-KR": "리모컨 앱",
        "zxx-XX": "ЛГ Rэмotэ AПП",
      },
      localizedVendorNames: { "": "LG Electronics" },
      permissions: [
        "TEST_SECURE",
        "CONTROL_INPUT_TEXT",
        "CONTROL_MOUSE_AND_KEYBOARD",
        "READ_INSTALLED_APPS",
        "READ_LGE_SDX",
        "READ_NOTIFICATIONS",
        "SEARCH",
        "WRITE_SETTINGS",
        "WRITE_NOTIFICATION_ALERT",
        "CONTROL_POWER",
        "READ_CURRENT_CHANNEL",
        "READ_RUNNING_APPS",
        "READ_UPDATE_INFO",
        "UPDATE_FROM_REMOTE_APP",
        "READ_LGE_TV_INPUT_EVENTS",
        "READ_TV_CURRENT_TIME",
      ],
      serial: "2f930e2d2cfe083771f68e4fe7bb07",
    },
    permissions: [
      "LAUNCH",
      "LAUNCH_WEBAPP",
      "APP_TO_APP",
      "CLOSE",
      "TEST_OPEN",
      "TEST_PROTECTED",
      "CONTROL_AUDIO",
      "CONTROL_DISPLAY",
      "CONTROL_INPUT_JOYSTICK",
      "CONTROL_INPUT_MEDIA_RECORDING",
      "CONTROL_INPUT_MEDIA_PLAYBACK",
      "CONTROL_INPUT_TV",
      "CONTROL_POWER",
      "READ_APP_STATUS",
      "READ_CURRENT_CHANNEL",
      "READ_INPUT_DEVICE_LIST",
      "READ_NETWORK_STATE",
      "READ_RUNNING_APPS",
      "READ_TV_CHANNEL_LIST",
      "WRITE_NOTIFICATION_TOAST",
      "READ_POWER_STATE",
      "READ_COUNTRY_INFO",
      "READ_SETTINGS",
      "CONTROL_TV_SCREEN",
      "CONTROL_TV_STANBY",
      "CONTROL_FAVORITE_GROUP",
      "CONTROL_USER_INFO",
      "CHECK_BLUETOOTH_DEVICE",
      "CONTROL_BLUETOOTH",
      "CONTROL_TIMER_INFO",
      "STB_INTERNAL_CONNECTION",
      "CONTROL_RECORDING",
      "READ_RECORDING_STATE",
      "WRITE_RECORDING_LIST",
      "READ_RECORDING_LIST",
      "READ_RECORDING_SCHEDULE",
      "WRITE_RECORDING_SCHEDULE",
      "READ_STORAGE_DEVICE_LIST",
      "READ_TV_PROGRAM_INFO",
      "CONTROL_BOX_CHANNEL",
      "READ_TV_ACR_AUTH_TOKEN",
      "READ_TV_CONTENT_STATE",
      "READ_TV_CURRENT_TIME",
      "ADD_LAUNCHER_CHANNEL",
      "SET_CHANNEL_SKIP",
      "RELEASE_CHANNEL_SKIP",
      "CONTROL_CHANNEL_BLOCK",
      "DELETE_SELECT_CHANNEL",
      "CONTROL_CHANNEL_GROUP",
      "SCAN_TV_CHANNELS",
      "CONTROL_TV_POWER",
      "CONTROL_WOL",
    ],
    signatures: [
      {
        signatureVersion: 1,
        signature:
          "eyJhbGdvcml0aG0iOiJSU0EtU0hBMjU2Iiwia2V5SWQiOiJ0ZXN0LXNpZ25pbmctY2VydCIsInNpZ25hdHVyZVZlcnNpb24iOjF9.hrVRgjCwXVvE2OOSpDZ58hR+59aFNwYDyjQgKk3auukd7pcegmE2CzPCa0bJ0ZsRAcKkCTJrWo5iDzNhMBWRyaMOv5zWSrthlf7G128qvIlpMT0YNY+n/FaOHE73uLrS/g7swl3/qH/BGFG2Hu4RlL48eb3lLKqTt2xKHdCs6Cd4RMfJPYnzgvI4BNrFUKsjkcu+WD4OO2A27Pq1n50cMchmcaXadJhGrOqH5YmHdOCj5NSHzJYrsW0HPlpuAx/ECMeIZYDh6RMqaFM2DXzdKX9NmmyqzJ3o/0lkk/N97gfVRLW5hA29yeAwaCViZNCP8iC9aO0q9fQojoa7NQnAtw==",
      },
    ],
  },
} as const;

interface PendingEntry {
  isRegister?: boolean;
  resolve: (payload: Record<string, unknown>) => void;
  reject: (err: Error) => void;
}

export interface LgWebOsConfig {
  ipAddress: string;
  /** A client-key from a previous successful pairing, if one is known. Echoing it back in the
   * register request lets the TV recognize this client without re-showing the on-screen
   * Allow/Deny prompt — see connect()'s real-hardware finding, 2026-09-10. */
  clientKey?: string;
}

/** Talks to one LG webOS TV's encrypted SSAP WebSocket channel (wss://3001, via relay), plus its separate pointer-input socket for button presses. One instance per TV. */
export class LgWebOsClient {
  private socket: WebSocket | null = null;
  private pointerSocket: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<string, PendingEntry>();
  /** Fired when the main socket closes after a successful connect (not during the initial
   * handshake, and not from this.close() being called deliberately) — set by the driver to
   * drive auto-reconnect. See LgWebOsDriver.ts. */
  onDisconnect: (() => void) | null = null;
  private closingDeliberately = false;
  // Real-hardware finding (2026-09-09): the main SSAP connection had the identical "check
  // pointerSocket, then create if missing" race that Family Command Center traced live on this
  // same TV — two rapid button presses (e.g. fast d-pad taps) before the first pointer-socket
  // request resolves would each see no open socket yet and independently request+open a second
  // one, hitting the exact same hang-instead-of-reject behavior the driver-level fix addressed.
  private pointerSocketPromise: Promise<WebSocket> | null = null;

  constructor(private config: LgWebOsConfig) {}

  // Real-hardware finding (2026-09-10), Sean directly: "find a way to make this so that i only
  // have to approve one time and it is forever remembered by the tv." The SSAP protocol already
  // supports exactly this — a successful register response carries a client-key, and sending that
  // same key back in a later register request lets the TV recognize the client and skip the
  // on-screen prompt entirely (confirmed against hobbyquaker/lgtv2, the reference implementation
  // this driver is already verified against — see the file header). This client received that key
  // every time and simply discarded it: the outer register-resolve callback ignored its own
  // `payload` argument, so nothing was ever available to persist, and every connect() requested a
  // fresh, promptable pairing. Fixed: resolve with the key (new or reconfirmed) so the driver can
  // persist it, and send any previously-known key back in the manifest payload.
  async connect(): Promise<string | undefined> {
    const socket = await openSocketWithRelayFallback(`${SCHEME}://${this.config.ipAddress}:${PORT}`);
    const registerId = String(this.nextId++);

    return new Promise<string | undefined>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(registerId);
        socket.close();
        // Real-hardware finding (2026-09-10): a saved client-key timing out here doesn't mean
        // Hearth forgot it — it was confirmed sent (see LgWebOsDriver's connect-attempt log) and
        // the TV still didn't recognize it, prompting fresh anyway. That happens when the TV's
        // own trust list has been cleared since (a firmware update, a factory reset, or someone
        // clearing "connected devices" in its settings) — a genuinely different situation from a
        // true first-time pairing, worth telling the user directly rather than the same generic
        // message either way.
        const message = this.config.clientKey
          ? "This TV isn't recognizing a previous pairing anymore (its own settings may have been reset or updated) — accept the on-screen prompt to re-approve it"
          : "Timed out waiting for pairing approval on the TV — accept the on-screen prompt and try again";
        reject(new Error(message));
      }, CONNECT_TIMEOUT_MS);

      this.pending.set(registerId, {
        isRegister: true,
        resolve: (payload) => {
          clearTimeout(timeout);
          this.socket = socket;
          // Only attached on a successful pairing — a close during the handshake itself is
          // handled by the reject path below, not treated as an unexpected disconnect.
          socket.onclose = () => {
            if (this.socket !== socket) return; // a newer connection has already replaced this one
            this.socket = null;
            if (!this.closingDeliberately) this.onDisconnect?.();
          };
          const clientKey = payload["client-key"];
          resolve(typeof clientKey === "string" ? clientKey : undefined);
        },
        reject: (err) => {
          clearTimeout(timeout);
          socket.close();
          reject(err);
        },
      });

      socket.onmessage = (event: { data: unknown }) => this.handleMessage(String(event.data));
      socket.onerror = () => {
        clearTimeout(timeout);
        this.pending.delete(registerId);
        reject(new Error(`Could not open a WebSocket to ${this.config.ipAddress}:${PORT}`));
      };

      // A known client-key rides alongside the manifest (not nested inside it) — same shape
      // hobbyquaker/lgtv2 sends. Only included when we have one; an unpaired device still sends
      // the plain manifest and gets prompted, exactly as before.
      const registerPayload = this.config.clientKey ? { ...PAIRING_MANIFEST, "client-key": this.config.clientKey } : PAIRING_MANIFEST;
      socket.send(JSON.stringify({ type: "register", id: registerId, payload: registerPayload }));
    });
  }

  /** Sends an SSAP request and resolves with its response payload. */
  call(uri: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    if (!this.socket || this.socket.readyState !== this.socket.OPEN) {
      throw new Error("LG webOS socket is not connected — call connect() first");
    }
    const id = String(this.nextId++);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket!.send(JSON.stringify({ type: "request", id, uri, payload }));
    });
  }

  /** Presses a remote button (HOME, BACK, ENTER, UP/DOWN/LEFT/RIGHT, VOLUMEUP, ...) via the TV's separate pointer-input socket. */
  async sendButton(name: string): Promise<void> {
    const socket = await this.getPointerSocket();
    socket.send(`type:button\nname:${name}\n\n`);
  }

  close(): void {
    this.closingDeliberately = true;
    this.pointerSocket?.close();
    this.pointerSocket = null;
    this.socket?.close();
    this.socket = null;
  }

  private async getPointerSocket(): Promise<WebSocket> {
    if (this.pointerSocket && this.pointerSocket.readyState === this.pointerSocket.OPEN) {
      return this.pointerSocket;
    }
    if (this.pointerSocketPromise) return this.pointerSocketPromise; // already opening — share it, don't open a second one
    this.pointerSocketPromise = this.openPointerSocket();
    try {
      return await this.pointerSocketPromise;
    } finally {
      this.pointerSocketPromise = null;
    }
  }

  private async openPointerSocket(): Promise<WebSocket> {
    const result = await this.call("ssap://com.webos.service.networkinput/getPointerInputSocket");
    const socketPath = result.socketPath;
    if (typeof socketPath !== "string") {
      throw new Error("LG TV did not return a pointer input socket path");
    }
    const socket = await openSocketWithRelayFallback(socketPath);
    this.pointerSocket = socket;
    return socket;
  }

  private handleMessage(data: string): void {
    let message: { id?: string; type?: string; error?: string; payload?: Record<string, unknown> };
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    const id = message.id;
    if (!id) return;
    const entry = this.pending.get(id);
    if (!entry) return;

    if (message.type === "error") {
      this.pending.delete(id);
      entry.reject(new Error(message.error ?? "LG webOS request failed"));
      return;
    }

    if (entry.isRegister) {
      const clientKey = message.payload?.["client-key"];
      if (typeof clientKey === "string" && clientKey.length > 0) {
        this.pending.delete(id);
        entry.resolve(message.payload ?? {});
      }
      // Otherwise this is the intermediate "prompt is showing" response — keep waiting.
      return;
    }

    this.pending.delete(id);
    const payload = message.payload ?? {};
    if (payload.returnValue === false) {
      entry.reject(new Error(String(payload.errorText ?? payload.errorCode ?? "LG webOS request failed")));
      return;
    }
    entry.resolve(payload);
  }
}
