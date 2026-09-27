import { normalizeHomeAssistantUrl } from "./HomeAssistantClient";

/** One Home Assistant server Hearth talks to: one credential shared by every device that lives on it (ADR-HEARTH-175). */
export interface HaInstance {
  id: string;
  baseUrl: string;
  token: string;
}

/** The stable id for a server address, safe as a secure-storage key ("http://ha.local:8123" -> "ha-http-ha.local-8123"). */
export function instanceIdFor(baseUrl: string): string {
  const normalized = normalizeHomeAssistantUrl(baseUrl);
  return `ha-${normalized.replace(/:\/\//, "-").replace(/[^a-zA-Z0-9._-]/g, "-")}`;
}
