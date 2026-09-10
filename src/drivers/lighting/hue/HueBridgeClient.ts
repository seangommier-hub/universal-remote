// Thin client for a Philips Hue bridge's local v1 REST API — plain HTTP, no TLS, runs entirely on
// the bridge itself once paired (no cloud dependency for local control). Source:
// https://developers.meethue.com/develop/hue-api/ ("Lights API", "Configuration API — Create
// User"). See ADR-HEARTH-032.

import { requestWithRelayFallback } from "../../../core/network/httpRelayFallback";

const DEFAULT_PORT = 80;

// Hue's native scales for brightness/hue/saturation — sourced from the Lights API docs above, not
// guessed. Brightness's real minimum is 1, not 0: the bridge treats 0 as "unset", and off/on is
// controlled entirely by the separate `on` boolean.
const HUE_MIN_BRIGHTNESS = 1;
const HUE_MAX_BRIGHTNESS = 254;
const HUE_MAX_HUE = 65535;
const HUE_MAX_SATURATION = 254;

export interface HueBridgeConfig {
  bridgeIpAddress: string;
  port?: number;
}

/** A light's state in universal units — brightness/saturation as 0-100 percentages, hue as 0-360 degrees (CSS-style HSL), not Hue's native 1-254/0-65535/0-254 scales. */
export interface HueLightState {
  on: boolean;
  brightness: number;
  hue: number;
  saturation: number;
  reachable: boolean;
  name?: string;
}

interface HueApiLightResponse {
  state: { on: boolean; bri?: number; hue?: number; sat?: number; reachable?: boolean };
  name?: string;
}

interface HueApiResultEntry {
  success?: Record<string, unknown>;
  error?: { type: number; description: string };
}

/** Thrown by `pair()` specifically when the bridge's link button hasn't been pressed yet (Hue error type 101) — a normal, retryable state during pairing, not a real failure. */
export class HuePairingPendingError extends Error {}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function toHueBrightness(percent: number): number {
  return Math.round(HUE_MIN_BRIGHTNESS + (clampPercent(percent) / 100) * (HUE_MAX_BRIGHTNESS - HUE_MIN_BRIGHTNESS));
}

function fromHueBrightness(bri: number): number {
  return Math.round(((bri - HUE_MIN_BRIGHTNESS) / (HUE_MAX_BRIGHTNESS - HUE_MIN_BRIGHTNESS)) * 100);
}

function toHueHue(degrees: number): number {
  return Math.round(((((degrees % 360) + 360) % 360) / 360) * HUE_MAX_HUE);
}

function fromHueHue(hue: number): number {
  return Math.round((hue / HUE_MAX_HUE) * 360);
}

function toHueSaturation(percent: number): number {
  return Math.round((clampPercent(percent) / 100) * HUE_MAX_SATURATION);
}

function fromHueSaturation(sat: number): number {
  return Math.round((sat / HUE_MAX_SATURATION) * 100);
}

/**
 * Talks to one Philips Hue bridge. One instance per bridge; a `username` (the bridge-issued
 * per-app API key from `pair()`) is required for every call except pairing itself. Hearth models
 * each Hue light as its own `Device`, so a light's `config` carries the bridge's IP + username
 * alongside its own `lightId`.
 */
export class HueBridgeClient {
  constructor(private config: HueBridgeConfig) {}

  private port(): number {
    return this.config.port ?? DEFAULT_PORT;
  }

  /**
   * One-time pairing: the user must physically press the bridge's link button within ~30 seconds
   * before calling this. Throws `HuePairingPendingError` when the button hasn't been pressed yet,
   * so callers can retry/poll instead of treating it as fatal.
   */
  async pair(appName: string): Promise<string> {
    const response = await requestWithRelayFallback({
      ip: this.config.bridgeIpAddress,
      port: this.port(),
      path: "/api",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ devicetype: appName }),
    });
    if (!response.ok) {
      throw new Error(`Hue bridge at ${this.config.bridgeIpAddress} returned HTTP ${response.status} pairing`);
    }
    const results = (await response.json()) as HueApiResultEntry[];
    const entry = results[0];
    const username = entry?.success?.username;
    if (typeof username === "string") return username;
    if (entry?.error?.type === 101) {
      throw new HuePairingPendingError("Press the link button on the Hue bridge, then try again");
    }
    throw new Error(`Hue bridge pairing failed: ${entry?.error?.description ?? "unknown error"}`);
  }

  /** Lists every light registered on the bridge, keyed by its light id — used to populate a light picker once pairing has produced a `username`. */
  async listLights(username: string): Promise<Record<string, { name: string }>> {
    const response = await requestWithRelayFallback({
      ip: this.config.bridgeIpAddress,
      port: this.port(),
      path: `/api/${username}/lights`,
      method: "GET",
    });
    if (!response.ok) {
      throw new Error(`Hue bridge at ${this.config.bridgeIpAddress} returned HTTP ${response.status} listing lights`);
    }
    return (await response.json()) as Record<string, { name: string }>;
  }

  async getLightState(username: string, lightId: string): Promise<HueLightState> {
    const response = await requestWithRelayFallback({
      ip: this.config.bridgeIpAddress,
      port: this.port(),
      path: `/api/${username}/lights/${lightId}`,
      method: "GET",
    });
    if (!response.ok) {
      throw new Error(`Hue bridge at ${this.config.bridgeIpAddress} returned HTTP ${response.status} reading light ${lightId}`);
    }
    const data = (await response.json()) as HueApiLightResponse;
    return {
      on: data.state.on,
      brightness: data.state.bri !== undefined ? fromHueBrightness(data.state.bri) : 0,
      hue: data.state.hue !== undefined ? fromHueHue(data.state.hue) : 0,
      saturation: data.state.sat !== undefined ? fromHueSaturation(data.state.sat) : 0,
      reachable: data.state.reachable ?? true,
      name: data.name,
    };
  }

  async setLightState(
    username: string,
    lightId: string,
    state: { on?: boolean; brightness?: number; hue?: number; saturation?: number }
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (state.on !== undefined) body.on = state.on;
    if (state.brightness !== undefined) body.bri = toHueBrightness(state.brightness);
    if (state.hue !== undefined) body.hue = toHueHue(state.hue);
    if (state.saturation !== undefined) body.sat = toHueSaturation(state.saturation);

    const response = await requestWithRelayFallback({
      ip: this.config.bridgeIpAddress,
      port: this.port(),
      path: `/api/${username}/lights/${lightId}/state`,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Hue bridge at ${this.config.bridgeIpAddress} returned HTTP ${response.status} setting light ${lightId}`);
    }
    const results = (await response.json()) as HueApiResultEntry[];
    const failure = results.find((entry) => entry.error);
    if (failure?.error) {
      throw new Error(`Hue bridge rejected light state update: ${failure.error.description}`);
    }
  }
}
