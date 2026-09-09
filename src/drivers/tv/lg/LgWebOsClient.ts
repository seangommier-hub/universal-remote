// Thin client for the unencrypted LG webOS SSAP WebSocket protocol
// (ws://<ip>:3000, root path — no service suffix). Unofficial/community-reverse-engineered
// (no first-party LG doc for this direction of control) — verified against the widely-used
// reference implementation https://github.com/hobbyquaker/lgtv2 (index.js, pairing.json,
// README.md). See ADR-HEARTH-006 for why this targets only the unencrypted port, not
// wss://3001, and why that's a narrower window than Samsung's equivalent limitation. See
// ADR-HEARTH-011: connect() and the pointer-input socket both fall back to relaying through
// Family Command Center if the TV isn't reachable directly from the phone's current network.

import { openSocketWithRelayFallback } from "../../../core/network/wsRelayFallback";

const CONNECT_TIMEOUT_MS = 30000; // the TV requires a physical on-screen approval tap
const PORT = 3000;

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
}

/** Talks to one LG webOS TV's unencrypted SSAP WebSocket channel, plus its separate pointer-input socket for button presses. One instance per TV. */
export class LgWebOsClient {
  private socket: WebSocket | null = null;
  private pointerSocket: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<string, PendingEntry>();

  constructor(private config: LgWebOsConfig) {}

  async connect(): Promise<void> {
    const socket = await openSocketWithRelayFallback(`ws://${this.config.ipAddress}:${PORT}`);
    const registerId = String(this.nextId++);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(registerId);
        socket.close();
        reject(new Error("Timed out waiting for pairing approval on the TV — accept the on-screen prompt and try again"));
      }, CONNECT_TIMEOUT_MS);

      this.pending.set(registerId, {
        isRegister: true,
        resolve: () => {
          clearTimeout(timeout);
          this.socket = socket;
          resolve();
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

      socket.send(JSON.stringify({ type: "register", id: registerId, payload: PAIRING_MANIFEST }));
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
    this.pointerSocket?.close();
    this.pointerSocket = null;
    this.socket?.close();
    this.socket = null;
  }

  private async getPointerSocket(): Promise<WebSocket> {
    if (this.pointerSocket && this.pointerSocket.readyState === this.pointerSocket.OPEN) {
      return this.pointerSocket;
    }
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
