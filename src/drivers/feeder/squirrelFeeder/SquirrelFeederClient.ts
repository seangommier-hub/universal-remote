// Thin client for the squirrel feeder's own local HTTP API (GET /status, POST /dispense). Plain
// HTTP, no auth — the ESP32's WebServer has no pairing/credential step at all, unlike Hue or the
// TV drivers (see squirrel-feeder project's adr/0006-0008). Response shapes mirror that project's
// src/network.cpp exactly (handleStatus/handleDispense), field names translated to camelCase.

import { requestWithRelayFallback } from "../../../core/network/httpRelayFallback";

const DEFAULT_PORT = 80;

export interface SquirrelFeederClientConfig {
  ipAddress: string;
  port?: number;
}

export type FeederState = "IDLE" | "VALIDATING" | "DISPENSING" | "COOLDOWN";

export interface SquirrelFeederStatus {
  online: boolean;
  uptime: number;
  wifiRssi: number;
  feederState: FeederState;
  detections: number;
  dispenses: number;
  lastDetection: number;
  lastDispense: number;
  cooldownActive: boolean;
}

interface StatusApiResponse {
  device: string;
  online: boolean;
  uptime: number;
  wifi_rssi: number;
  feeder_state: string;
  detections: number;
  dispenses: number;
  last_detection: number;
  last_dispense: number;
  cooldown_active: boolean;
}

/** Thrown by `dispense()` when the feeder responds HTTP 429 (network.cpp's handleDispense: gate not idle) — a normal, retryable "busy" outcome, not a connection failure (ADR-HEARTH-104). */
export class SquirrelFeederBusyError extends Error {}

/** Talks to one squirrel feeder's ESP32 HTTP API. One instance per device. */
export class SquirrelFeederClient {
  constructor(private config: SquirrelFeederClientConfig) {}

  private port(): number {
    return this.config.port ?? DEFAULT_PORT;
  }

  async getStatus(): Promise<SquirrelFeederStatus> {
    const response = await requestWithRelayFallback({
      ip: this.config.ipAddress,
      port: this.port(),
      path: "/status",
      method: "GET",
    });
    if (!response.ok) {
      throw new Error(`Squirrel feeder at ${this.config.ipAddress} returned HTTP ${response.status} reading status`);
    }
    const data = (await response.json()) as StatusApiResponse;
    return {
      online: data.online,
      uptime: data.uptime,
      wifiRssi: data.wifi_rssi,
      feederState: data.feeder_state as FeederState,
      detections: data.detections,
      dispenses: data.dispenses,
      lastDetection: data.last_detection,
      lastDispense: data.last_dispense,
      cooldownActive: data.cooldown_active,
    };
  }

  /** Requests a manual dispense. Throws `SquirrelFeederBusyError` when the feeder isn't idle (HTTP 429) — retryable, not fatal. */
  async dispense(): Promise<void> {
    const response = await requestWithRelayFallback({
      ip: this.config.ipAddress,
      port: this.port(),
      path: "/dispense",
      method: "POST",
    });
    if (response.status === 429) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new SquirrelFeederBusyError(data?.error ?? "Feeder busy — try again once idle");
    }
    if (!response.ok) {
      throw new Error(`Squirrel feeder at ${this.config.ipAddress} returned HTTP ${response.status} requesting dispense`);
    }
  }
}
