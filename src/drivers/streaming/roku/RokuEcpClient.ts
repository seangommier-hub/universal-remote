// Thin client for Roku's official External Control Protocol (ECP) — plain unencrypted HTTP,
// no auth, no pairing. Source: https://developer.roku.com/docs/developer-program/debugging/external-control-api.md
// Applies to both Roku streaming devices and Roku TVs (they share ECP).

import { requestWithRelayFallback } from "../../../core/network/httpRelayFallback";

const DEFAULT_PORT = 8060;

export interface RokuEcpConfig {
  ipAddress: string;
  port?: number;
}

export interface RokuDeviceInfo {
  powerMode?: string;
  modelName?: string;
}

// Real-hardware research (2026-09-12, ADR-HEARTH-051): sourced directly from Roku's own ECP docs
// (https://developer.roku.com/docs/developer-program/debugging/external-control-api.md), the same
// authoritative source this whole driver is already built against — not community-guessed. The
// documented example response is `<player error="false" state="play">...`; "pause" is the only
// other value this project found actually exercised by a real client (python-rokuecp, a widely
// used community library, treats exactly "play"/"pause" as the two valid states and discards
// anything else) — corroboration, not the primary source.
export interface RokuMediaPlayerState {
  state?: string;
}

// device-info's fields we need are simple non-nested <tag>value</tag> pairs — a minimal regex
// extractor is enough here and avoids pulling in a full XML parser for two fields. Not suitable
// for nested/repeated elements.
function extractXmlTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match?.[1];
}

// /query/media-player's playback state is an XML *attribute* on the <player> element
// (`<player state="play">`), not element text — extractXmlTag doesn't cover this shape, hence a
// second small regex extractor rather than reusing/generalizing it for a single field.
function extractXmlAttribute(xml: string, tag: string, attribute: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*\\b${attribute}="([^"]*)"`));
  return match?.[1];
}

/** Talks to one Roku device's ECP interface. One instance per device. */
export class RokuEcpClient {
  constructor(private config: RokuEcpConfig) {}

  private port(): number {
    return this.config.port ?? DEFAULT_PORT;
  }

  async keypress(key: string): Promise<void> {
    const response = await requestWithRelayFallback({
      ip: this.config.ipAddress,
      port: this.port(),
      path: `/keypress/${key}`,
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Roku at ${this.config.ipAddress} returned HTTP ${response.status} for keypress ${key}`);
    }
  }

  /** Launches an installed channel by its numeric Roku channel ID (e.g. Netflix is "12") — same ECP mechanism as keypress, documented at developer.roku.com's "Launch a channel" section. */
  async launchChannel(channelId: string): Promise<void> {
    const response = await requestWithRelayFallback({
      ip: this.config.ipAddress,
      port: this.port(),
      path: `/launch/${channelId}`,
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Roku at ${this.config.ipAddress} returned HTTP ${response.status} launching channel ${channelId}`);
    }
  }

  /** Real ECP query, documented at developer.roku.com — reports live playback state (see RokuMediaPlayerState). */
  async getMediaPlayerState(): Promise<RokuMediaPlayerState> {
    const response = await requestWithRelayFallback({
      ip: this.config.ipAddress,
      port: this.port(),
      path: "/query/media-player",
      method: "GET",
    });
    if (!response.ok) {
      throw new Error(`Roku at ${this.config.ipAddress} returned HTTP ${response.status} for media-player query`);
    }
    const xml = await response.text();
    return { state: extractXmlAttribute(xml, "player", "state") };
  }

  async getDeviceInfo(): Promise<RokuDeviceInfo> {
    const response = await requestWithRelayFallback({
      ip: this.config.ipAddress,
      port: this.port(),
      path: "/query/device-info",
      method: "GET",
    });
    if (!response.ok) {
      throw new Error(`Roku at ${this.config.ipAddress} returned HTTP ${response.status} for device-info`);
    }
    const xml = await response.text();
    return {
      powerMode: extractXmlTag(xml, "power-mode"),
      modelName: extractXmlTag(xml, "model-name"),
    };
  }
}
