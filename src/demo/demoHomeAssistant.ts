import { HomeAssistantEntity } from "../drivers/homeAssistant/HomeAssistantClient";
import { HaImportCandidate, buildImportCandidates } from "../drivers/homeAssistant/haImportCandidates";
import { HaRegistrySnapshot } from "../drivers/homeAssistant/haRegistries";
import { demoScreenParam } from "./demoMode";

// Demo-only fixture for the bulk "Sync from Home Assistant" screen (?demo=1&screen=ha-sync), so the web
// harness can show it without a Home Assistant server. It runs through the real registry filtering and area mapping.

export const DEMO_HA_SYNC_SCREEN = "ha-sync";

const state = (entityId: string, name: string, attributes: Record<string, unknown> = {}): HomeAssistantEntity => ({
  entity_id: entityId,
  state: "off",
  attributes: { friendly_name: name, ...attributes },
});

const COLOR_LIGHT = { supported_color_modes: ["hs"] };
const MEDIA_FEATURES = { supported_features: 128 + 256 + 4 };

const DEMO_STATES: HomeAssistantEntity[] = [
  state("light.kitchen_ceiling", "Kitchen Ceiling", COLOR_LIGHT),
  state("switch.coffee_maker", "Coffee Maker"),
  state("light.living_lamp", "Living Room Lamp", COLOR_LIGHT),
  state("media_player.living_tv", "Living Room TV", MEDIA_FEATURES),
  state("light.bed_left", "Bedside Left", COLOR_LIGHT),
  state("switch.garage_fan", "Garage Fan"),
  state("light.hallway", "Hallway Light", COLOR_LIGHT),
  state("switch.old_device", "Old Device"),
  state("switch.bridge_led", "Bridge LED"),
  state("light.den_lamp", "Den Lamp", COLOR_LIGHT),
];

const DEMO_REGISTRIES: HaRegistrySnapshot = {
  areas: [
    { areaId: "kitchen", name: "Kitchen" },
    { areaId: "living_room", name: "Living Room" },
    { areaId: "bedroom", name: "Bedroom" },
    { areaId: "garage", name: "Garage" },
  ],
  devices: [
    { id: "dev_tv", areaId: "living_room", disabled: false },
    { id: "dev_bed", areaId: "bedroom", disabled: false },
    { id: "dev_old", areaId: "garage", disabled: true },
  ],
  entities: [
    { entityId: "light.kitchen_ceiling", deviceId: null, areaId: "kitchen", disabled: false, hidden: false, entityCategory: null },
    { entityId: "switch.coffee_maker", deviceId: null, areaId: "kitchen", disabled: false, hidden: false, entityCategory: null },
    { entityId: "light.living_lamp", deviceId: null, areaId: "living_room", disabled: false, hidden: false, entityCategory: null },
    { entityId: "media_player.living_tv", deviceId: "dev_tv", areaId: null, disabled: false, hidden: false, entityCategory: null },
    { entityId: "light.bed_left", deviceId: "dev_bed", areaId: null, disabled: false, hidden: false, entityCategory: null },
    { entityId: "switch.garage_fan", deviceId: null, areaId: "garage", disabled: false, hidden: false, entityCategory: null },
    { entityId: "switch.old_device", deviceId: "dev_old", areaId: null, disabled: false, hidden: false, entityCategory: null },
    { entityId: "switch.bridge_led", deviceId: null, areaId: null, disabled: false, hidden: false, entityCategory: "diagnostic" },
  ],
};

const ALREADY_ADDED = new Set(["light.living_lamp"]);

/** The demo sync-screen candidates when the URL asks for ?screen=ha-sync in demo mode; null in every other case. */
export function demoHaSyncCandidates(): HaImportCandidate[] | null {
  if (demoScreenParam() !== DEMO_HA_SYNC_SCREEN) return null;
  return buildImportCandidates(DEMO_STATES, DEMO_REGISTRIES, ALREADY_ADDED);
}
