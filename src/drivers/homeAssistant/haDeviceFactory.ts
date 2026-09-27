import { Device } from "../../core/types/Device";
import { HOME_ASSISTANT_DRIVER_ID } from "./HomeAssistantDriver";
import { HaInstance } from "./haInstance";
import { ImportedHaEntity } from "./haEntityMapping";

/** Builds the Hearth device for one imported Home Assistant entity; it holds no secret, only which shared instance and entity it is (ADR-HEARTH-175). */
export function buildHomeAssistantDevice(entity: ImportedHaEntity, instance: HaInstance, now: number = Date.now()): Device {
  return {
    id: `homeassistant-${entity.entityId.replace(/\W/g, "_")}-${now}`,
    name: entity.name,
    category: entity.category,
    manufacturer: "Home Assistant",
    model: entity.domain,
    driverId: HOME_ASSISTANT_DRIVER_ID,
    capabilities: entity.capabilities,
    config: { instanceId: instance.id, entityId: entity.entityId, ...(entity.deviceClass ? { deviceClass: entity.deviceClass } : {}) },
  };
}
