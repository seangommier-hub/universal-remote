import { Platform } from "react-native";
import { DeviceLayout, emptyLayout } from "../core/layout/deviceLayout";
import { Device } from "../core/types/Device";
import { DEMO_BROADLINK_ID, DEMO_KASA_ID, DEMO_LG_ID, DEMO_ROKU_ID, DEMO_SAMSUNG_ID, DEMO_SONOS_ID } from "./demoHousehold";
import { isDemoMode } from "./demoMode";

// ADR-HEARTH-173: demo-only ?layout=rooms | favorites so the web harness can show the organised Devices tab.

const LAYOUT_QUERY_PARAM = "layout";

function layoutParam(): string | null {
  if (!isDemoMode() || Platform.OS !== "web" || typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(LAYOUT_QUERY_PARAM);
}

/** A fixed layout for the demo household when the URL asks for one; null means use the phone's real saved layout. */
export function demoDeviceLayout(devices: readonly Device[]): DeviceLayout | null {
  const kind = layoutParam();
  if (kind !== "rooms" && kind !== "favorites") return null;
  const known = new Set(devices.map((d) => d.id));
  const keep = (ids: string[]) => ids.filter((id) => known.has(id));
  const rooms: Record<string, string> = kind === "rooms"
    ? { [DEMO_LG_ID]: "Living Room", [DEMO_SONOS_ID]: "Living Room", [DEMO_SAMSUNG_ID]: "Bedroom", [DEMO_BROADLINK_ID]: "Living Room", [DEMO_KASA_ID]: "Kitchen" }
    : {};
  return { ...emptyLayout(), rooms, favorites: keep([DEMO_LG_ID, DEMO_SONOS_ID, DEMO_KASA_ID]), order: keep([DEMO_SONOS_ID, DEMO_LG_ID, DEMO_BROADLINK_ID, DEMO_SAMSUNG_ID, DEMO_ROKU_ID, DEMO_KASA_ID]), collapsedRooms: kind === "rooms" ? ["kitchen"] : [] };
}
