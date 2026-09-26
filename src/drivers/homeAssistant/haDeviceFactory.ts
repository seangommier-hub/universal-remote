import { Device } from "../../core/types/Device";
import { HOME_ASSISTANT_DRIVER_ID } from "./HomeAssistantDriver";
import { normalizeHomeAssistantUrl } from "./HomeAssistantClient";
import { ImportedHaEntity } from "./haEntityMapping";

/** Builds the Hearth device for one imported Home Assistant entity; the token lands in `config.token`, which is stored in secure storage like every other secret. */
export function buildHomeAssistantDevice(entity: ImportedHaEntity, baseUrl: string, token: string, now: number = Date.now()): Device {
  return {
    id: `homeassistant-${entity.entityId.replace(/\W/g, "_")}-${now}`,
    name: entity.name,
    category: entity.category,
    manufacturer: "Home Assistant",
    model: entity.domain,
    driverId: HOME_ASSISTANT_DRIVER_ID,
    capabilities: entity.capabilities,
    config: { baseUrl: normalizeHomeAssistantUrl(baseUrl), token: token.trim(), entityId: entity.entityId },
  };
}
