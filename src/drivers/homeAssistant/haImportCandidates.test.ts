import { fakeHa, haState, installFakeHaServer } from "../../testUtils/fakeHaServer";
import { buildHomeAssistantDevice } from "./haDeviceFactory";
import { buildImportCandidates, defaultSelection, groupByArea, roomForCandidate } from "./haImportCandidates";
import { readRegistriesOnce } from "./haImportData";
import { fetchHaRegistries, parseAreas, parseRegistryDevices, parseRegistryEntities } from "./haRegistries";
import { HaSession } from "./haSession";

jest.mock("../shared/backoffJitter", () => ({ withBackoffJitter: (delayMs: number) => delayMs }));

const SWITCH_FEATURES = {};
const STATES = [
  haState("switch.kitchen_plug", "off", SWITCH_FEATURES),
  haState("switch.own_area", "off"),
  haState("switch.device_area", "off"),
  haState("switch.disabled_entity", "off"),
  haState("switch.hidden_entity", "off"),
  haState("switch.diag", "off"),
  haState("switch.cfg", "off"),
  haState("switch.on_disabled_device", "off"),
  haState("switch.no_registry", "off"),
  haState("switch.unknown_area", "off"),
  haState("sensor.temperature", "20"),
];

const REGISTRY_REPLIES = {
  "config/area_registry/list": [{ area_id: "kitchen", name: "Kitchen" }, { area_id: "den", name: "Den" }, { bad: true }],
  "config/device_registry/list": [
    { id: "dev1", area_id: "kitchen", disabled_by: null },
    { id: "dev_off", area_id: "den", disabled_by: "user" },
  ],
  "config/entity_registry/list": [
    { entity_id: "switch.kitchen_plug", device_id: "dev1", area_id: null, disabled_by: null, hidden_by: null, entity_category: null },
    { entity_id: "switch.own_area", device_id: "dev1", area_id: "den", disabled_by: null, hidden_by: null, entity_category: null },
    { entity_id: "switch.device_area", device_id: "dev1", area_id: null, disabled_by: null, hidden_by: null, entity_category: null },
    { entity_id: "switch.disabled_entity", device_id: null, area_id: "den", disabled_by: "integration", hidden_by: null, entity_category: null },
    { entity_id: "switch.hidden_entity", device_id: null, area_id: "den", disabled_by: null, hidden_by: "user", entity_category: null },
    { entity_id: "switch.diag", device_id: null, area_id: "den", disabled_by: null, hidden_by: null, entity_category: "diagnostic" },
    { entity_id: "switch.cfg", device_id: null, area_id: "den", disabled_by: null, hidden_by: null, entity_category: "config" },
    { entity_id: "switch.on_disabled_device", device_id: "dev_off", area_id: null, disabled_by: null, hidden_by: null, entity_category: null },
    { entity_id: "switch.unknown_area", device_id: null, area_id: "deleted_area", disabled_by: null, hidden_by: null, entity_category: null },
  ],
};

function registries() {
  return {
    areas: parseAreas(REGISTRY_REPLIES["config/area_registry/list"]),
    devices: parseRegistryDevices(REGISTRY_REPLIES["config/device_registry/list"]),
    entities: parseRegistryEntities(REGISTRY_REPLIES["config/entity_registry/list"]),
  };
}

describe("registry parsing", () => {
  test("rows without the fields Hearth needs are ignored", () => {
    expect(parseAreas([{ area_id: "a", name: "A" }, { area_id: "b" }, null, "x"])).toEqual([{ areaId: "a", name: "A" }]);
    expect(parseRegistryDevices("not a list")).toEqual([]);
  });
});

describe("buildImportCandidates", () => {
  const candidates = buildImportCandidates(STATES, registries(), new Set(["switch.own_area"]));
  const ids = candidates.map((c) => c.entityId);

  test("skips disabled, hidden, config, diagnostic, disabled-device and unsupported-domain entities", () => {
    expect(ids).not.toEqual(expect.arrayContaining(["switch.disabled_entity", "switch.hidden_entity", "switch.diag", "switch.cfg", "switch.on_disabled_device", "sensor.temperature"]));
    expect(ids.sort()).toEqual(["switch.device_area", "switch.kitchen_plug", "switch.no_registry", "switch.own_area", "switch.unknown_area"]);
  });

  test("an entity's own area wins over its device's area, and a device area is inherited otherwise", () => {
    const area = (id: string) => candidates.find((c) => c.entityId === id)?.areaName;
    expect(area("switch.own_area")).toBe("Den");
    expect(area("switch.device_area")).toBe("Kitchen");
    expect(area("switch.kitchen_plug")).toBe("Kitchen");
  });

  test("entities absent from the registry, or pointing at a deleted area, have no area", () => {
    const area = (id: string) => candidates.find((c) => c.entityId === id)?.areaName;
    expect(area("switch.no_registry")).toBeNull();
    expect(area("switch.unknown_area")).toBeNull();
  });

  test("without registries every supported entity is offered with no area", () => {
    const all = buildImportCandidates(STATES, null, new Set());
    expect(all.filter((c) => c.areaName !== null)).toHaveLength(0);
    expect(all.map((c) => c.entityId)).toContain("switch.diag");
  });

  test("default selection is everything supported that is not already added", () => {
    expect(defaultSelection(candidates).has("switch.own_area")).toBe(false);
    expect(defaultSelection(candidates).has("switch.kitchen_plug")).toBe(true);
    expect(candidates.find((c) => c.entityId === "switch.own_area")?.alreadyAdded).toBe(true);
  });

  test("a later sync offers only entities that are not already Hearth devices", () => {
    const added = new Set(ids.filter((id) => id !== "switch.no_registry"));
    const second = buildImportCandidates(STATES, registries(), added);
    expect([...defaultSelection(second)]).toEqual(["switch.no_registry"]);
  });

  test("groups by area sorted by name with no-area last", () => {
    expect(groupByArea(candidates).map((g) => g.areaName)).toEqual(["Den", "Kitchen", null]);
  });

  test("an area becomes the device's Hearth room name, and none stays empty", () => {
    const den = candidates.find((c) => c.entityId === "switch.own_area")!;
    const none = candidates.find((c) => c.entityId === "switch.no_registry")!;
    expect(roomForCandidate(den)).toBe("Den");
    expect(roomForCandidate(none)).toBe("");
    const device = buildHomeAssistantDevice(den, { id: "ha-x", baseUrl: "http://ha.test:8123", token: "t" }, 1);
    expect(device.config).toEqual({ instanceId: "ha-x", entityId: "switch.own_area" });
  });
});

describe("registries over the WebSocket", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    installFakeHaServer("reg-token");
    fakeHa.registryReplies = REGISTRY_REPLIES;
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("fetchHaRegistries reads all three lists from a live session", async () => {
    const session = new HaSession({ baseUrl: "http://ha.test:8123", token: "reg-token" });
    session.start();
    for (let round = 0; round < 12; round++) await jest.advanceTimersByTimeAsync(0);
    const pending = fetchHaRegistries(session);
    for (let round = 0; round < 12; round++) await jest.advanceTimersByTimeAsync(0);
    const snapshot = await pending;
    expect(snapshot.areas.map((a) => a.name)).toEqual(["Kitchen", "Den"]);
    expect(snapshot.entities).toHaveLength(9);
    expect(fakeHa.requestLog).toEqual(expect.arrayContaining(["config/area_registry/list", "config/device_registry/list", "config/entity_registry/list"]));
    session.stop();
  });

  test("readRegistriesOnce returns null when the token is rejected so the list still works without areas", async () => {
    const pending = readRegistriesOnce("http://ha.test:8123", "wrong-token");
    for (let round = 0; round < 12; round++) await jest.advanceTimersByTimeAsync(0);
    await expect(pending).resolves.toBeNull();
  });

  test("readRegistriesOnce returns the snapshot and leaves no socket or timer behind", async () => {
    const pending = readRegistriesOnce("http://ha.test:8123", "reg-token");
    for (let round = 0; round < 24; round++) await jest.advanceTimersByTimeAsync(0);
    const snapshot = await pending;
    expect(snapshot?.devices).toHaveLength(2);
    expect(jest.getTimerCount()).toBe(0);
  });
});
