// Thin client for the PS4/PS5 "Device Discovery Protocol" (DDP) — a plain, unencrypted,
// text-over-UDP protocol on port 987, unofficial/community-reverse-engineered (no first-party
// Sony documentation). No capability/driver logic here — this file only knows how to build/parse
// DDP packets and run the two operations Ps5Driver needs: capturing a real wake credential, and
// sending a wake.
//
// Verified against two independent, real reference implementations:
//  - github.com/dhleong/ps4-waker (`lib/ps4lib.js`) — the DDP message format itself
//    (`"{TYPE} * HTTP/1.1\n{key}:{value}\n...device-discovery-protocol-version:00020020\n"`), and
//    the `WAKEUP` request's header fields (`client-type`, `auth-type`, `user-credential`).
//  - github.com/ktnrg45/pyps4-2ndscreen (`pyps4_2ndscreen/credential.py`) — the credential-capture
//    trick itself: bind UDP 987, answer a `SRCH` search with a plain `HTTP/1.1 620 Server Standby`
//    reply (making this phone show up as a pairable device in Sony's own official "PlayStation
//    App"), then read `client-type`/`auth-type`/`user-credential` straight out of the plaintext
//    `WAKEUP` packet the official app sends once the user taps that entry. This is the same
//    mechanism Home Assistant's own PS4/PS5 integration setup instructs users through — a passive
//    local-network capture of a broadcast the user's own official Sony app already sends, never a
//    request to Sony's servers.
//
// No TCP, no RSA/AES: that heavier encrypted session (also present in both reference
// implementations) is only needed for full remote control (media transport, on-screen keyboard,
// app launch) — genuinely out of scope here, same "only claim what's actually implemented"
// principle as XboxDriver.ts's power-on-only SmartGlass scope.

import dgram from "react-native-udp";

const DDP_PORT = 987;
const DDP_VERSION = "00020020";
const CAPTURE_TIMEOUT_MS = 120000; // generous: the user needs to switch to another app and tap a device

export interface Ps5Credentials {
  clientType: string;
  authType: string;
  userCredential: string;
}

type UdpSocket = ReturnType<typeof dgram.createSocket>;

function buildDdpRequest(type: string, fields: Record<string, string> = {}): string {
  const lines = [`${type} * HTTP/1.1`, ...Object.entries(fields).map(([key, value]) => `${key}:${value}`), `device-discovery-protocol-version:${DDP_VERSION}`, ""];
  return lines.join("\n");
}

function buildDdpResponse(status: string, fields: Record<string, string>): string {
  const lines = [`HTTP/1.1 ${status}`, ...Object.entries(fields).map(([key, value]) => `${key}:${value}`), `device-discovery-protocol-version:${DDP_VERSION}`, ""];
  return lines.join("\n");
}

/** Returns the DDP request type ("SRCH"/"WAKEUP"/...) from a request's own first line, or undefined for anything else (including this client's own status responses, which start with "HTTP/1.1" instead). */
function parseDdpRequestType(message: string): string | undefined {
  const firstLine = message.split("\n")[0] ?? "";
  const match = /^(\S+) \* HTTP\/1\.1/.exec(firstLine);
  return match?.[1];
}

function parseDdpFields(message: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of message.split("\n").slice(1)) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    fields[line.slice(0, colonIndex).trim()] = line.slice(colonIndex + 1).trim();
  }
  return fields;
}

export class Ps5PairingTimeoutError extends Error {}

/** Talks to one PS4/PS5 console's DDP wake mechanism. */
export class Ps5Client {
  /**
   * Runs the one-time credential-capture dance: binds UDP 987 and answers Sony's official
   * PlayStation App's own network scan as if this phone were a console in standby, then waits for
   * the user to tap that entry within the app — at which point the app sends a real WAKEUP packet
   * carrying the account's actual wake credential, which this resolves with. Never talks to Sony's
   * servers; purely a local passive capture. `onListening` fires once the socket is actually bound
   * and ready, so the UI can tell the user it's safe to switch to the PlayStation App now.
   */
  async captureCredentials(deviceName: string, onListening: () => void, signal?: AbortSignal): Promise<Ps5Credentials> {
    const socket: UdpSocket = dgram.createSocket({ type: "udp4" });

    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("error", reject);
        socket.bind(DDP_PORT, () => resolve());
      });
    } catch (err) {
      socket.close();
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not listen on UDP port ${DDP_PORT} for pairing (${message}) — this phone may not allow binding this port`);
    }

    onListening();

    return new Promise<Ps5Credentials>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Ps5PairingTimeoutError("Timed out waiting for the PlayStation App to send credentials — open it and tap the device that appeared, then try again"));
      }, CAPTURE_TIMEOUT_MS);

      const onAbort = () => {
        cleanup();
        reject(new Error("Cancelled"));
      };
      signal?.addEventListener("abort", onAbort);

      function cleanup() {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
        socket.close();
      }

      socket.on("message", (msg: Buffer, rinfo: { address: string; port: number }) => {
        const text = msg.toString("utf8");
        const type = parseDdpRequestType(text);
        if (type === "SRCH") {
          const response = buildDdpResponse("620 Server Standby", {
            "host-id": "HEARTH000001",
            "host-type": "PS4",
            "host-name": deviceName,
            "host-request-port": String(DDP_PORT),
          });
          socket.send(response, undefined, undefined, rinfo.port, rinfo.address, () => {});
        } else if (type === "WAKEUP") {
          const fields = parseDdpFields(text);
          const { "client-type": clientType, "auth-type": authType, "user-credential": userCredential } = fields;
          if (clientType && authType && userCredential) {
            cleanup();
            resolve({ clientType, authType, userCredential });
          }
        }
      });
    });
  }

  /** Sends one real wake request directly to the console's own IP — no reply exists in this
   * protocol (see class doc), so "the packet was sent" is the most honest claim available, same
   * treatment as XboxDriver's own power-on. */
  async sendWake(ipAddress: string, credentials: Ps5Credentials): Promise<void> {
    const socket: UdpSocket = dgram.createSocket({ type: "udp4" });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("error", reject);
        socket.bind(0, () => resolve());
      });
      const message = buildDdpRequest("WAKEUP", {
        "client-type": credentials.clientType,
        "auth-type": credentials.authType,
        "user-credential": credentials.userCredential,
      });
      await new Promise<void>((resolve, reject) => {
        socket.send(message, undefined, undefined, DDP_PORT, ipAddress, (err?: Error) => (err ? reject(err) : resolve()));
      });
    } finally {
      socket.close();
    }
  }
}
