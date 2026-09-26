import { isIP } from "node:net";
import WebSocket from "ws";

const PRIVATE_IPV4_PATTERN = /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** True for loopback and private-LAN hosts, where a device's self-signed certificate is the norm. */
export function isPrivateNetworkHost(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare) === 4) return PRIVATE_IPV4_PATTERN.test(bare);
  return bare === "::1" || bare === "localhost";
}

/**
 * WebSocket for the drivers under Node. Uses `ws` because Node's built-in WebSocket cannot skip
 * certificate verification, and LG/Samsung TVs only speak wss:// with a private-CA certificate.
 * Verification is skipped only for private-LAN hosts; public hosts (the Cloudflare tunnel) stay verified.
 */
export class HearthNodeWebSocket extends WebSocket {
  constructor(url: string) {
    super(url, { rejectUnauthorized: !isPrivateNetworkHost(new URL(url).hostname) });
    this.binaryType = "arraybuffer";
  }
}

/** Installs the shim as the global WebSocket the drivers construct. */
export function installNodeWebSocket(): void {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = HearthNodeWebSocket;
}
