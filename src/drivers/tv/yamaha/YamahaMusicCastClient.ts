// Thin client for Yamaha's official "MusicCast Extended Control" (YXC) API — a plain, documented,
// unauthenticated local HTTP/JSON API (LAN-trust model, same as Roku ECP). No capability/driver
// logic here — this file only knows how to make one GET call and parse one response envelope.
// Source: https://community.symcon.de/uploads/short-url/vRXaJXAn6vI2DSQYMHF0aqLbdir.pdf (Yamaha's
// own Extended Control API Specification, community-hosted) — researched and cited in
// ADR-HEARTH-054.

import { requestWithRelayFallback } from "../../../core/network/httpRelayFallback";

const YAMAHA_PORT = 80;
const API_BASE = "/YamahaExtendedControl/v1";
// This driver only ever targets the "main" zone — MusicCast receivers can expose zone2/3/4, but
// every other Hearth TV/AVR driver models one primary device state, not per-zone control; adding
// zone selection is a real future feature, not part of this first pass.
const ZONE = "main";

export interface YamahaMusicCastConfig {
  ipAddress: string;
}

export interface YamahaMainStatus {
  power: "on" | "standby";
  volume: number;
  max_volume: number;
  mute: boolean;
  input: string;
}

export interface YamahaInputEntry {
  id: string;
  distribution_enable?: boolean;
}

interface YamahaFeatures {
  zone?: Array<{ id: string; input_list?: string[] }>;
}

interface YamahaEnvelope {
  response_code: number;
}

export class YamahaMusicCastApiError extends Error {
  constructor(public code: number) {
    super(`Yamaha MusicCast API error (response_code ${code})`);
  }
}

/** Talks to one Yamaha MusicCast AV receiver/soundbar over its local Extended Control API. One instance per device. */
export class YamahaMusicCastClient {
  constructor(private config: YamahaMusicCastConfig) {}

  private async get<T extends YamahaEnvelope>(path: string): Promise<T> {
    const response = await requestWithRelayFallback({
      ip: this.config.ipAddress,
      port: YAMAHA_PORT,
      path: `${API_BASE}${path}`,
      method: "GET",
    });
    if (!response.ok) {
      throw new Error(`Yamaha MusicCast at ${this.config.ipAddress} returned HTTP ${response.status}`);
    }
    const body = (await response.json()) as T;
    if (body.response_code !== 0) {
      throw new YamahaMusicCastApiError(body.response_code);
    }
    return body;
  }

  async getStatus(): Promise<YamahaMainStatus> {
    return this.get<YamahaMainStatus & YamahaEnvelope>(`/${ZONE}/getStatus`);
  }

  /** Real input ids/labels for this specific device — read via system/getFeatures, same "never hardcode, read live" pattern as LG/Sony's own input-list refresh. */
  async getAvailableInputs(): Promise<string[]> {
    const features = await this.get<YamahaFeatures & YamahaEnvelope>("/system/getFeatures");
    const zone = features.zone?.find((z) => z.id === ZONE);
    return zone?.input_list ?? [];
  }

  async setPower(on: boolean): Promise<void> {
    await this.get(`/${ZONE}/setPower?power=${on ? "on" : "standby"}`);
  }

  async setVolume(volume: number): Promise<void> {
    await this.get(`/${ZONE}/setVolume?volume=${Math.round(volume)}`);
  }

  async setMute(enable: boolean): Promise<void> {
    await this.get(`/${ZONE}/setMute?enable=${enable ? "true" : "false"}`);
  }

  async setInput(input: string): Promise<void> {
    await this.get(`/${ZONE}/setInput?input=${encodeURIComponent(input)}`);
  }
}
