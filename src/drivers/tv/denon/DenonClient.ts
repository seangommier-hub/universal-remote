// Thin client for Denon/Marantz AV receivers' legacy "formiPhoneApp" HTTP control surface — a
// plain, unauthenticated GET-based API (same LAN-trust model as Roku ECP/Yamaha MusicCast/Sonos).
// No capability/driver logic here — this file only knows how to make one GET call and parse one
// status response.
// Source: github.com/ol-iver/denonavr (the actively-maintained reference implementation) —
// verified directly against its `denonavr/const.py` for every URL/command below, and against its
// own real captured device fixture (`tests/xml/AVR-1713-formMainZone_MainZoneXmlStatus.xml`) for
// the exact status-response shape. Marantz receivers share this same protocol (denonavr itself
// supports both brands under one library — see its own `const.py` "Marantz"-labeled entries for
// the handful of Marantz-only extras, none of which this client needs).
//
// Real protocol quirk, not guessed: MasterVolume is reported in dB (commonly a negative number,
// e.g. -67.0 relative to a reference level), not a 0-100 percentage like every other driver here.
// Converting that to a 0-100 scale would need the receiver's own model-specific max-volume ceiling
// (MVMAX), which isn't reliably present in the status endpoint this client reads — rather than
// invent an unverified conversion, this passes the real dB value straight through as `volume`.
// Confirmed safe: `state.values.volume` is rendered as plain text in a status pill
// (UniversalTvRemote.tsx), not a 0-100 slider, and no UI currently drives `setVolume` from one.

import { requestWithRelayFallback } from "../../../core/network/httpRelayFallback";

const DENON_PORT = 80;
const STATUS_PATH = "/goform/formMainZone_MainZoneXmlStatus.xml";

export interface DenonConfig {
  ipAddress: string;
}

export interface DenonStatus {
  power: "ON" | "OFF" | "STANDBY" | string;
  volumeDb: number;
  muted: boolean;
}

/** Extracts a Denon status XML field's nested <Tag><value>X</value></Tag> text — same minimal regex-extractor approach RokuEcpClient.ts/SonosClient.ts already use for their own XML responses. */
function extractNestedValue(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}>\\s*<value>([^<]*)</value>`));
  return match?.[1]?.trim();
}

export class DenonClient {
  constructor(private config: DenonConfig) {}

  private async get(path: string): Promise<void> {
    const response = await requestWithRelayFallback({ ip: this.config.ipAddress, port: DENON_PORT, path, method: "GET" });
    if (!response.ok) {
      throw new Error(`Denon/Marantz receiver at ${this.config.ipAddress} returned HTTP ${response.status}`);
    }
  }

  async getStatus(): Promise<DenonStatus> {
    const response = await requestWithRelayFallback({ ip: this.config.ipAddress, port: DENON_PORT, path: STATUS_PATH, method: "GET" });
    if (!response.ok) {
      throw new Error(`Denon/Marantz receiver at ${this.config.ipAddress} returned HTTP ${response.status}`);
    }
    const xml = await response.text();
    const power = extractNestedValue(xml, "Power") ?? "OFF";
    const volumeDb = Number(extractNestedValue(xml, "MasterVolume") ?? 0);
    const muted = (extractNestedValue(xml, "Mute") ?? "off").toLowerCase() === "on";
    return { power, volumeDb, muted };
  }

  async powerOn(): Promise<void> {
    await this.get("/goform/formiPhoneAppPower.xml?1+PowerOn");
  }

  async powerStandby(): Promise<void> {
    await this.get("/goform/formiPhoneAppPower.xml?1+PowerStandby");
  }

  async volumeUp(): Promise<void> {
    await this.get("/goform/formiPhoneAppDirect.xml?MVUP");
  }

  async volumeDown(): Promise<void> {
    await this.get("/goform/formiPhoneAppDirect.xml?MVDOWN");
  }

  /** `volumeDb` is the receiver's own native dB scale, not 0-100 — see this file's top-of-file doc comment. */
  async setVolume(volumeDb: number): Promise<void> {
    await this.get(`/goform/formiPhoneAppVolume.xml?1+${volumeDb.toFixed(1)}`);
  }

  async setMute(mute: boolean): Promise<void> {
    await this.get(`/goform/formiPhoneAppMute.xml?1+${mute ? "MuteOn" : "MuteOff"}`);
  }

  async play(): Promise<void> {
    await this.get("/goform/formiPhoneAppDirect.xml?NS9A");
  }

  async pause(): Promise<void> {
    await this.get("/goform/formiPhoneAppDirect.xml?NS9B");
  }
}
