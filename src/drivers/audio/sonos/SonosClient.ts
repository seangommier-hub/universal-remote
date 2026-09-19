// Thin SOAP/UPnP client for Sonos speakers' local control API — a plain, unauthenticated,
// undocumented-by-Sony-but-extremely-well-established protocol (Sonos itself publishes no local
// API docs; this is the same LAN control every third-party Sonos app, including Sonos's own
// discontinued official ones, has used for over a decade). No capability/driver logic here — this
// file only knows how to send one SOAP action and parse one response.
// Source: SoCo (github.com/SoCo/SoCo), the de facto reference implementation for Sonos local
// control — verified directly against its `soco/services.py` (SOAP envelope/header format) and
// `soco/core.py` (the exact action names and argument shapes for volume/mute/play/pause below).

import { requestWithRelayFallback } from "../../../core/network/httpRelayFallback";

const SONOS_PORT = 1400;
const INSTANCE_ID = "0";
const MASTER_CHANNEL = "Master";

export interface SonosConfig {
  ipAddress: string;
}

export type SonosTransportState = "PLAYING" | "PAUSED_PLAYBACK" | "STOPPED" | "TRANSITIONING" | string;

export class SonosApiError extends Error {
  constructor(public statusCode: number) {
    super(`Sonos at this IP returned HTTP ${statusCode}`);
  }
}

/** Extracts one flat <Tag>value</Tag> field from a SOAP response body — same minimal
 * regex-extractor approach RokuEcpClient.ts already uses for its own XML responses, sufficient for
 * UPnP's flat argument-list responses without pulling in a full XML parser. */
function extractXmlTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match?.[1];
}

function wrapArguments(args: Record<string, string | number>): string {
  return Object.entries(args)
    .map(([name, value]) => `<${name}>${escapeXml(String(value))}</${name}>`)
    .join("");
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Talks to one Sonos speaker's UPnP control endpoints (RenderingControl for volume/mute,
 * AVTransport for playback). One instance per speaker. */
export class SonosClient {
  constructor(private config: SonosConfig) {}

  private async call(serviceType: "RenderingControl" | "AVTransport", action: string, args: Record<string, string | number>): Promise<string> {
    const body =
      '<?xml version="1.0"?>' +
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
      "<s:Body>" +
      `<u:${action} xmlns:u="urn:schemas-upnp-org:service:${serviceType}:1">` +
      wrapArguments(args) +
      `</u:${action}>` +
      "</s:Body>" +
      "</s:Envelope>";

    const response = await requestWithRelayFallback({
      ip: this.config.ipAddress,
      port: SONOS_PORT,
      path: `/${serviceType}/Control`,
      method: "POST",
      headers: {
        "Content-Type": 'text/xml; charset="utf-8"',
        SOAPACTION: `urn:schemas-upnp-org:service:${serviceType}:1#${action}`,
      },
      body,
    });

    if (!response.ok) {
      throw new SonosApiError(response.status);
    }
    return response.text();
  }

  async getVolume(): Promise<number> {
    const xml = await this.call("RenderingControl", "GetVolume", { InstanceID: INSTANCE_ID, Channel: MASTER_CHANNEL });
    return Number(extractXmlTag(xml, "CurrentVolume") ?? 0);
  }

  async setVolume(volume: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, Math.round(volume)));
    await this.call("RenderingControl", "SetVolume", { InstanceID: INSTANCE_ID, Channel: MASTER_CHANNEL, DesiredVolume: clamped });
  }

  async getMute(): Promise<boolean> {
    const xml = await this.call("RenderingControl", "GetMute", { InstanceID: INSTANCE_ID, Channel: MASTER_CHANNEL });
    return extractXmlTag(xml, "CurrentMute") === "1";
  }

  async setMute(mute: boolean): Promise<void> {
    await this.call("RenderingControl", "SetMute", { InstanceID: INSTANCE_ID, Channel: MASTER_CHANNEL, DesiredMute: mute ? "1" : "0" });
  }

  async getTransportState(): Promise<SonosTransportState> {
    const xml = await this.call("AVTransport", "GetTransportInfo", { InstanceID: INSTANCE_ID });
    return (extractXmlTag(xml, "CurrentTransportState") ?? "STOPPED") as SonosTransportState;
  }

  async play(): Promise<void> {
    await this.call("AVTransport", "Play", { InstanceID: INSTANCE_ID, Speed: "1" });
  }

  async pause(): Promise<void> {
    await this.call("AVTransport", "Pause", { InstanceID: INSTANCE_ID, Speed: "1" });
  }
}
