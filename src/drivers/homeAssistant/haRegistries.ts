import { HaSession } from "./haSession";

export interface HaArea {
  areaId: string;
  name: string;
}

export interface HaRegistryDevice {
  id: string;
  areaId: string | null;
  disabled: boolean;
}

export interface HaRegistryEntity {
  entityId: string;
  deviceId: string | null;
  areaId: string | null;
  disabled: boolean;
  hidden: boolean;
  entityCategory: string | null;
}

export interface HaRegistrySnapshot {
  areas: HaArea[];
  devices: HaRegistryDevice[];
  entities: HaRegistryEntity[];
}

const AREA_LIST = "config/area_registry/list";
const DEVICE_LIST = "config/device_registry/list";
const ENTITY_LIST = "config/entity_registry/list";

type Row = Record<string, unknown>;

const text = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value.filter((row): row is Row => typeof row === "object" && row !== null) : []);

/** Reads the area registry reply, ignoring rows without an id and name. */
export function parseAreas(raw: unknown): HaArea[] {
  return rows(raw).flatMap((row) => {
    const areaId = text(row.area_id);
    const name = text(row.name);
    return areaId && name ? [{ areaId, name }] : [];
  });
}

/** Reads the device registry reply; a device counts as disabled when `disabled_by` is set. */
export function parseRegistryDevices(raw: unknown): HaRegistryDevice[] {
  return rows(raw).flatMap((row) => {
    const id = text(row.id);
    return id ? [{ id, areaId: text(row.area_id), disabled: text(row.disabled_by) !== null }] : [];
  });
}

/** Reads the entity registry reply, keeping the fields that decide whether and where an entity is offered. */
export function parseRegistryEntities(raw: unknown): HaRegistryEntity[] {
  return rows(raw).flatMap((row) => {
    const entityId = text(row.entity_id);
    if (!entityId) return [];
    return [{
      entityId,
      deviceId: text(row.device_id),
      areaId: text(row.area_id),
      disabled: text(row.disabled_by) !== null,
      hidden: text(row.hidden_by) !== null,
      entityCategory: text(row.entity_category),
    }];
  });
}

/** Fetches the three registries over a live session in parallel. */
export async function fetchHaRegistries(session: HaSession): Promise<HaRegistrySnapshot> {
  const [areas, devices, entities] = await Promise.all([
    session.request<unknown>(AREA_LIST),
    session.request<unknown>(DEVICE_LIST),
    session.request<unknown>(ENTITY_LIST),
  ]);
  return { areas: parseAreas(areas), devices: parseRegistryDevices(devices), entities: parseRegistryEntities(entities) };
}
