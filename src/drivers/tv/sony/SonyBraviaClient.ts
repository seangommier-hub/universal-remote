// Thin JSON-RPC client for the official Sony BRAVIA REST API. No capability/driver logic here —
// this file only knows how to make one call and parse one response, per Sony's documented
// request/response envelope.
// Source: https://pro-bravia.sony.net/develop/integrate/rest-api/spec/getting-started/
//         https://pro-bravia.sony.net/remote-display-control/rest-api/reference/

import { requestWithRelayFallback } from "../../../core/network/httpRelayFallback";

const SONY_PORT = 80;

export interface SonyBraviaConfig {
  ipAddress: string;
  psk: string;
}

interface JsonRpcSuccess {
  result?: unknown;
  id: number;
}

interface JsonRpcError {
  error: [number, string];
  id: number;
}

export class SonyBraviaApiError extends Error {
  constructor(public code: number, message: string) {
    super(`Sony BRAVIA API error ${code}: ${message}`);
  }
}

/** Talks to one Sony BRAVIA TV over its local REST API. One instance per TV. */
export class SonyBraviaClient {
  private nextId = 1;

  constructor(private config: SonyBraviaConfig) {}

  async call<T = unknown>(service: string, method: string, params: unknown[] = [], version = "1.0"): Promise<T> {
    const id = this.nextId++;
    const response = await requestWithRelayFallback({
      ip: this.config.ipAddress,
      port: SONY_PORT,
      path: `/sony/${service}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-PSK": this.config.psk,
      },
      body: JSON.stringify({ method, id, params, version }),
    });

    if (!response.ok) {
      throw new Error(`Sony BRAVIA at ${this.config.ipAddress} returned HTTP ${response.status}`);
    }

    const body = (await response.json()) as JsonRpcSuccess | JsonRpcError;
    if ("error" in body) {
      throw new SonyBraviaApiError(body.error[0], body.error[1]);
    }
    return body.result as T;
  }
}
