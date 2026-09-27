import { cleanRoomName } from "../../core/layout/deviceLayout";
import { HomeAssistantEntity } from "./HomeAssistantClient";
import { ImportedHaEntity, importSupportedEntities } from "./haEntityMapping";
import { HaRegistrySnapshot } from "./haRegistries";

/** Entity categories Home Assistant uses for settings and health readouts, not things a person operates. */
const HIDDEN_ENTITY_CATEGORIES = ["config", "diagnostic"];
export const NO_AREA_LABEL = "No area";

export interface HaImportCandidate extends ImportedHaEntity {
  areaName: string | null;
  alreadyAdded: boolean;
}

export interface HaAreaGroup {
  /** The Home Assistant area name, or null for entities with no area. */
  areaName: string | null;
  candidates: HaImportCandidate[];
}

/** Which entity ids the registries say to leave out (disabled, hidden, config or diagnostic, or on a disabled device). */
function excludedEntityIds(registries: HaRegistrySnapshot): Set<string> {
  const disabledDevices = new Set(registries.devices.filter((device) => device.disabled).map((device) => device.id));
  const excluded = new Set<string>();
  for (const entry of registries.entities) {
    const onDisabledDevice = entry.deviceId !== null && disabledDevices.has(entry.deviceId);
    const skippedCategory = entry.entityCategory !== null && HIDDEN_ENTITY_CATEGORIES.includes(entry.entityCategory);
    if (entry.disabled || entry.hidden || skippedCategory || onDisabledDevice) excluded.add(entry.entityId);
  }
  return excluded;
}

/** Entity id -> area name, where an entity's own area wins over its device's area. */
function areaNamesByEntity(registries: HaRegistrySnapshot): Map<string, string> {
  const areaNames = new Map(registries.areas.map((area) => [area.areaId, area.name]));
  const deviceAreas = new Map(registries.devices.map((device) => [device.id, device.areaId]));
  const result = new Map<string, string>();
  for (const entry of registries.entities) {
    const effectiveAreaId = entry.areaId ?? (entry.deviceId ? deviceAreas.get(entry.deviceId) ?? null : null);
    const name = effectiveAreaId ? areaNames.get(effectiveAreaId) : undefined;
    if (name) result.set(entry.entityId, name);
  }
  return result;
}

/**
 * The entities Hearth can import: supported domains only, minus registry-excluded ones, each tagged with its
 * effective Home Assistant area and whether a Hearth device already exists for it. Without registries (null)
 * every supported entity is offered with no area.
 */
export function buildImportCandidates(states: HomeAssistantEntity[], registries: HaRegistrySnapshot | null, addedEntityIds: ReadonlySet<string>): HaImportCandidate[] {
  const excluded = registries ? excludedEntityIds(registries) : new Set<string>();
  const areas = registries ? areaNamesByEntity(registries) : new Map<string, string>();
  return importSupportedEntities(states.filter((entity) => !excluded.has(entity.entity_id))).map((entity) => ({
    ...entity,
    areaName: areas.get(entity.entityId) ?? null,
    alreadyAdded: addedEntityIds.has(entity.entityId),
  }));
}

/** Groups candidates by area (names sorted, "no area" last), keeping each group's entity order. */
export function groupByArea(candidates: HaImportCandidate[]): HaAreaGroup[] {
  const byArea = new Map<string | null, HaImportCandidate[]>();
  for (const candidate of candidates) byArea.set(candidate.areaName, [...(byArea.get(candidate.areaName) ?? []), candidate]);
  return Array.from(byArea, ([areaName, list]) => ({ areaName, candidates: list })).sort((a, b) => {
    if (a.areaName === null) return 1;
    if (b.areaName === null) return -1;
    return a.areaName.localeCompare(b.areaName);
  });
}

/** The default checkbox state: everything supported that is not already a Hearth device. */
export function defaultSelection(candidates: HaImportCandidate[]): Set<string> {
  return new Set(candidates.filter((candidate) => !candidate.alreadyAdded).map((candidate) => candidate.entityId));
}

/** The Hearth room a candidate's Home Assistant area becomes (ADR-HEARTH-173 layout), or "" for none. */
export function roomForCandidate(candidate: HaImportCandidate): string {
  return candidate.areaName ? cleanRoomName(candidate.areaName) : "";
}
