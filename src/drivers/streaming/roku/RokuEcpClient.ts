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
  /** The device's own real, human-set name (e.g. "Living Room Roku"), not the generic DHCP
   * hostname discovery otherwise falls back on. Sourced and verified directly (2026-09-18,
   * ADR-HEARTH-085) against `ctalkington/python-rokuecp`'s `Info.from_dict` (`models.py`):
   * `user-device-name` is the actual "Name your Roku" setting; Roku leaves it empty until a user
   * sets one, at which point `friendly-device-name` (Roku's own generated default, e.g. "Roku
   * Ultra") is the better of the two remaining fallbacks — `default-device-name` (a generic
   * model-based string) is deliberately not used here since it carries no real information beyond
   * what `modelName` above already gives. */
  name?: string;
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

// Real-hardware research (2026-09-16, ADR-HEARTH-076): confirmed byte-for-byte against
// `python-rokuecp`'s own Application model (ctalkington/python-rokuecp, src/rokuecp/models.py) —
// GET /query/apps returns `<apps><app id="12" type="appl" version="4.3.109">Netflix</app>...
// </apps>`, the exact same per-app shape /query/active-app already uses for the single currently-
// focused app, just repeated for every installed channel. Roku's own ECP docs page fetched this
// session didn't surface a dedicated /query/apps section (Netlify/CDN blocked automated fetches
// of the full doc), so this specific endpoint's shape rests on the community client rather than a
// directly-read primary source — flagged honestly, not presented as more certain than it is.
export interface RokuApp {
  id: string;
  name: string;
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

// /query/apps repeats the same <app id="..." version="...">Name</app> element once per installed
// channel — extractXmlElementText/extractXmlAttribute only ever find the first match, hence a
// dedicated multi-match variant rather than looping a single-match regex (which would loop
// forever on a global-less pattern, or need its own lastIndex bookkeeping either way).
function extractAllXmlElements(xml: string, tag: string): { text: string; id?: string }[] {
  const pattern = new RegExp(`<${tag}([^>]*)>([^<]*)</${tag}>`, "g");
  const results: { text: string; id?: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const idMatch = match[1].match(/\bid="([^"]*)"/);
    results.push({ text: match[2], id: idMatch?.[1] });
  }
  return results;
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

  /** See RokuApp's own doc comment for sourcing. Apps with no id attribute (shouldn't happen for a real installed channel, but the type allows it) are dropped — an app Hearth can't launch by id isn't useful to list. */
  async getApps(): Promise<RokuApp[]> {
    const response = await requestWithRelayFallback({
      ip: this.config.ipAddress,
      port: this.port(),
      path: "/query/apps",
      method: "GET",
    });
    if (!response.ok) {
      throw new Error(`Roku at ${this.config.ipAddress} returned HTTP ${response.status} for apps query`);
    }
    const xml = await response.text();
    return extractAllXmlElements(xml, "app")
      .filter((entry): entry is { text: string; id: string } => typeof entry.id === "string")
      .map((entry) => ({ id: entry.id, name: entry.text }));
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
    const userDeviceName = extractXmlTag(xml, "user-device-name");
    return {
      powerMode: extractXmlTag(xml, "power-mode"),
      modelName: extractXmlTag(xml, "model-name"),
      name: (userDeviceName && userDeviceName.trim()) || extractXmlTag(xml, "friendly-device-name"),
    };
  }
}
