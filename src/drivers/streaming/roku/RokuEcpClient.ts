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

// Real-hardware research (2026-09-15, ADR-HEARTH-068): confirmed directly against Roku's own ECP
// docs (https://developer.roku.com/dev/docs/external-control-api) and a mirrored copy of the
// same page (community.roku.com's own developer forum links have gone dead). /query/active-app
// reports which app currently has focus as `<app id="...">Name</app>` — the id attribute is
// absent and the text is literally "Roku" when nothing is running (the home screen). When the
// system screensaver is active, a sibling `<screensaver .../>` element is also present. This is
// the best available signal (not a documented guarantee) for telling "genuinely idle" apart from
// "an app is active but its own playback state is ambiguous right now" — see
// RokuEcpDriver.ts's refreshPlaybackState for how it's used. It cannot detect an in-app modal
// overlay (a PIN pad, a login screen) at all — Roku's docs have no endpoint for that; this only
// ever answers "is any app running, or are we at the home screen/screensaver."
export interface RokuActiveApp {
  appName?: string;
  isHomeScreen: boolean;
  isScreensaver: boolean;
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

// /query/active-app's <app> element carries attributes when an app is running (`<app id="12"
// type="appl" version="4.3.109">Netflix</app>`) but not on the home screen (`<app>Roku</app>`) —
// extractXmlTag's exact `<tag>` match only covers the no-attributes case, hence this variant.
function extractXmlElementText(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`));
  return match?.[1];
}

function hasXmlElement(xml: string, tag: string): boolean {
  return new RegExp(`<${tag}[\\s/>]`).test(xml);
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

  /** See RokuActiveApp's own doc comment for what this can and can't tell a caller. */
  async getActiveApp(): Promise<RokuActiveApp> {
    const response = await requestWithRelayFallback({
      ip: this.config.ipAddress,
      port: this.port(),
      path: "/query/active-app",
      method: "GET",
    });
    if (!response.ok) {
      throw new Error(`Roku at ${this.config.ipAddress} returned HTTP ${response.status} for active-app query`);
    }
    const xml = await response.text();
    const appName = extractXmlElementText(xml, "app");
    const appId = extractXmlAttribute(xml, "app", "id");
    return {
      appName,
      isHomeScreen: !appId && appName === "Roku",
      isScreensaver: hasXmlElement(xml, "screensaver"),
    };
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
