import { Command } from "../../core/types/Command";
import { CapabilityId } from "../../core/types/Capability";
import { Device } from "../../core/types/Device";
import { HomeAssistantEntity } from "./HomeAssistantClient";
import { HOME_ASSISTANT_DRIVER_ID, HomeAssistantDriver } from "./HomeAssistantDriver";
import { HaCommandValidationError, commandToServiceCall } from "./haCommandMapping";
import { buildHomeAssistantDevice } from "./haDeviceFactory";
import { capabilitiesForEntity, importSupportedEntities } from "./haEntityMapping";
import { buildImportCandidates, defaultSelection } from "./haImportCandidates";
import { entityConnection, entityToValues } from "./haStateMapping";
import { resetTemperatureUnitsForTests } from "./haUnitSystem";

jest.mock("../shared/backoffJitter", () => ({ withBackoffJitter: (delayMs: number) => delayMs }));

const BASE = "http://ha.test:8123";

function entity(entityId: string, state: string, attributes: Record<string, unknown> = {}): HomeAssistantEntity {
  return { entity_id: entityId, state, attributes };
}

function command(capability: CapabilityId, args?: Record<string, unknown>): Command {
  return { deviceId: "d", capability, args };
}

describe("cover", () => {
  const cover = entity("cover.garage", "closed", { supported_features: 1 | 2 | 8, device_class: "garage", current_cover_position: 0 });

  test("capabilities follow the feature bits", () => {
    expect(capabilitiesForEntity(cover)).toEqual(["open", "close", "stop"]);
    expect(capabilitiesForEntity(entity("cover.blind", "open", { supported_features: 15 }))).toEqual(["open", "close", "stop", "setPosition"]);
  });

  test("a cover with no supported features is not offered", () => {
    expect(importSupportedEntities([entity("cover.odd", "open", {})])).toEqual([]);
  });

  test("commands call the cover services and clamp the position", () => {
    expect(commandToServiceCall(command("open"), "cover.garage", {})).toEqual({ domain: "cover", service: "open_cover", data: { entity_id: "cover.garage" } });
    expect(commandToServiceCall(command("close"), "cover.garage", {}).service).toBe("close_cover");
    expect(commandToServiceCall(command("stop"), "cover.garage", {}).service).toBe("stop_cover");
    expect(commandToServiceCall(command("setPosition", { position: 140 }), "cover.b", {})).toEqual({ domain: "cover", service: "set_cover_position", data: { entity_id: "cover.b", position: 100 } });
    expect(() => commandToServiceCall(command("setPosition"), "cover.b", {})).toThrow(HaCommandValidationError);
  });

  test("state carries the cover state, position and device class", () => {
    expect(entityToValues(cover)).toMatchObject({ coverState: "closed", position: 0, deviceClass: "garage" });
    expect(entityToValues(cover)).not.toHaveProperty("power");
  });

  test("the device remembers its device class so the confirm can apply", () => {
    const [imported] = importSupportedEntities([cover]);
    const device = buildHomeAssistantDevice(imported, { id: "ha-http-ha-test-8123", baseUrl: BASE, token: "t" });
    expect(device.category).toBe("cover");
    expect(device.config).toEqual({ instanceId: "ha-http-ha-test-8123", entityId: "cover.garage", deviceClass: "garage" });
  });
});

describe("lock", () => {
  test("offers lock and unlock, and commands never carry a code", () => {
    expect(capabilitiesForEntity(entity("lock.front", "locked"))).toEqual(["lock", "unlock"]);
    expect(commandToServiceCall(command("unlock", { code: "1234" }), "lock.front", {})).toEqual({ domain: "lock", service: "unlock", data: { entity_id: "lock.front" } });
    expect(commandToServiceCall(command("lock"), "lock.front", {}).service).toBe("lock");
  });

  test("state exposes the lock state (jammed stays jammed)", () => {
    expect(entityToValues(entity("lock.front", "jammed"))).toMatchObject({ lockState: "jammed" });
  });
});

describe("scene, script, automation and button", () => {
  test.each([
    ["scene.movie", "scene", "turn_on"],
    ["script.goodnight", "script", "turn_on"],
    ["automation.dusk", "automation", "trigger"],
    ["button.chime", "button", "press"],
  ])("%s runs through %s.%s", (entityId, domain, service) => {
    expect(capabilitiesForEntity(entity(entityId, "unknown"))).toEqual(["trigger"]);
    expect(commandToServiceCall(command("trigger"), entityId, {})).toEqual({ domain, service, data: { entity_id: entityId } });
  });

  test("an action entity has no power reading to show", () => {
    expect(entityToValues(entity("script.goodnight", "off"))).not.toHaveProperty("power");
  });

  test("a stateless action's unknown state is a distinct unknown connection", () => {
    expect(entityConnection(entity("button.chime", "unknown"))).toBe("unknown");
  });
});

describe("input_boolean and fan", () => {
  test("an input_boolean is a switch and uses its own domain's power services", () => {
    expect(capabilitiesForEntity(entity("input_boolean.guest", "off"))).toEqual(["power"]);
    expect(commandToServiceCall(command("powerOn"), "input_boolean.guest", {})).toEqual({ domain: "input_boolean", service: "turn_on", data: { entity_id: "input_boolean.guest" } });
    expect(entityToValues(entity("input_boolean.guest", "on"))).toMatchObject({ power: "on" });
  });

  test("a fan gets speed and preset only when its features and preset list say so", () => {
    expect(capabilitiesForEntity(entity("fan.a", "on", { supported_features: 1 | 8, preset_modes: ["auto"] }))).toEqual(["power", "setFanSpeed", "setFanPreset"]);
    expect(capabilitiesForEntity(entity("fan.b", "on", { supported_features: 8, preset_modes: [] }))).toEqual(["power"]);
  });

  test("fan commands and state", () => {
    expect(commandToServiceCall(command("setFanSpeed", { percentage: 55.4 }), "fan.a", {})).toEqual({ domain: "fan", service: "set_percentage", data: { entity_id: "fan.a", percentage: 55 } });
    expect(commandToServiceCall(command("setFanPreset", { preset: "auto" }), "fan.a", {}).data).toEqual({ entity_id: "fan.a", preset_mode: "auto" });
    expect(entityToValues(entity("fan.a", "on", { percentage: 40, preset_mode: "sleep", preset_modes: ["sleep"] }))).toMatchObject({ power: "on", percentage: 40, preset: "sleep", presets: ["sleep"] });
  });
});

describe("climate", () => {
  const climate = entity("climate.hall", "heat", { supported_features: 1, hvac_modes: ["off", "heat", "cool"], temperature: 70, current_temperature: 68, min_temp: 45, max_temp: 90, hvac_action: "heating" });

  test("target temperature and hvac mode capabilities", () => {
    expect(capabilitiesForEntity(climate)).toEqual(["setTemperature", "setHvacMode"]);
    expect(capabilitiesForEntity(entity("climate.range", "auto", { supported_features: 2, hvac_modes: ["auto"] }))).toEqual([]);
  });

  test("commands map to set_temperature and set_hvac_mode", () => {
    expect(commandToServiceCall(command("setTemperature", { temperature: 21.5 }), "climate.hall", {}).data).toEqual({ entity_id: "climate.hall", temperature: 21.5 });
    expect(commandToServiceCall(command("setHvacMode", { mode: "cool" }), "climate.hall", {})).toMatchObject({ service: "set_hvac_mode", data: { hvac_mode: "cool" } });
    expect(() => commandToServiceCall(command("setHvacMode"), "climate.hall", {})).toThrow(HaCommandValidationError);
  });

  test("state carries target, current, limits, modes and action", () => {
    expect(entityToValues(climate)).toMatchObject({ hvacMode: "heat", hvacModes: ["off", "heat", "cool"], temperature: 70, currentTemperature: 68, minTemp: 45, maxTemp: 90, hvacAction: "heating" });
  });
});

describe("vacuum", () => {
  const vacuum = entity("vacuum.robo", "docked", { supported_features: 8192 | 8 | 16 | 32, battery_level: 80, fan_speed_list: ["Quiet", "Standard", "Turbo", "Max"] });

  test("capabilities reuse the existing vacuum ids", () => {
    expect(capabilitiesForEntity(vacuum)).toEqual(["vacuumStart", "vacuumStop", "vacuumDock", "setSuctionPower"]);
    expect(capabilitiesForEntity(entity("vacuum.old", "docked", { supported_features: 4 }))).toEqual([]);
  });

  test("commands, with suction levels spread over the fan speed list", () => {
    const values = { fanSpeeds: ["Quiet", "Standard", "Turbo", "Max"] };
    expect(commandToServiceCall(command("vacuumStart"), "vacuum.robo", values).service).toBe("start");
    expect(commandToServiceCall(command("vacuumStop"), "vacuum.robo", values).service).toBe("stop");
    expect(commandToServiceCall(command("vacuumDock"), "vacuum.robo", values).service).toBe("return_to_base");
    expect(commandToServiceCall(command("setSuctionPower", { level: 3 }), "vacuum.robo", values).data).toEqual({ entity_id: "vacuum.robo", fan_speed: "Max" });
    expect(commandToServiceCall(command("setSuctionPower", { level: 0 }), "vacuum.robo", { fanSpeeds: ["Eco", "Boost"] }).data).toEqual({ entity_id: "vacuum.robo", fan_speed: "Eco" });
    expect(() => commandToServiceCall(command("setSuctionPower", { level: 1 }), "vacuum.robo", {})).toThrow(HaCommandValidationError);
  });

  test("state uses the vacuum screen's own status words and battery", () => {
    expect(entityToValues(vacuum)).toMatchObject({ workingStatus: "Charging", battery: 80, fanSpeeds: ["Quiet", "Standard", "Turbo", "Max"] });
    expect(entityToValues(entity("vacuum.robo", "cleaning"))).toMatchObject({ workingStatus: "Clearing" });
    expect(entityToValues(entity("vacuum.robo", "error"))).toMatchObject({ workingStatus: "InTrouble" });
  });
});

describe("sensor and binary_sensor", () => {
  test("sensors with a class or unit are read-only tiles; bare text sensors and timestamps are skipped", () => {
    const imported = importSupportedEntities([
      entity("sensor.temp", "72", { device_class: "temperature", unit_of_measurement: "°F" }),
      entity("sensor.text", "hello"),
      entity("sensor.boot", "2026-01-01T00:00:00", { device_class: "timestamp" }),
      entity("binary_sensor.door", "off", { device_class: "door" }),
    ]);
    expect(imported.map((e) => e.entityId).sort()).toEqual(["binary_sensor.door", "sensor.temp"]);
    expect(imported.every((e) => e.category === "sensor" && e.capabilities.length === 0)).toBe(true);
  });

  test("readings carry unit and a plain label for binary sensors", () => {
    expect(entityToValues(entity("sensor.temp", "72.4", { unit_of_measurement: "°F", device_class: "temperature" }))).toMatchObject({ reading: "72.4", unit: "°F" });
    expect(entityToValues(entity("binary_sensor.door", "on", { device_class: "door" }))).toMatchObject({ active: true, reading: "Open" });
    expect(entityToValues(entity("binary_sensor.motion", "off", { device_class: "motion" }))).toMatchObject({ active: false, reading: "No motion" });
    expect(entityToValues(entity("binary_sensor.x", "on"))).toMatchObject({ reading: "On" });
  });

  test("diagnostic sensors are hidden by the registry and unticked by default", () => {
    const states = [entity("sensor.temp", "1", { unit_of_measurement: "°F" }), entity("sensor.rssi", "-50", { unit_of_measurement: "dBm" }), entity("lock.front", "locked")];
    const registries = {
      areas: [], devices: [],
      entities: [{ entityId: "sensor.rssi", deviceId: null, areaId: null, disabled: false, hidden: false, entityCategory: "diagnostic" }],
    };
    const candidates = buildImportCandidates(states, registries, new Set());
    expect(candidates.map((c) => c.entityId).sort()).toEqual(["lock.front", "sensor.temp"]);
    expect(Array.from(defaultSelection(candidates))).toEqual(["lock.front"]);
  });
});

describe("unavailable and unknown", () => {
  test("unavailable is disconnected and unknown is unknown, never quietly off", () => {
    expect(entityConnection(entity("switch.a", "unavailable"))).toBe("disconnected");
    expect(entityConnection(entity("lock.a", "unknown"))).toBe("unknown");
    expect(entityConnection(entity("switch.a", "off"))).toBe("connected");
    expect(entityToValues(entity("lock.a", "unavailable"))).not.toHaveProperty("lockState");
    expect(entityToValues(entity("cover.a", "unknown"))).toMatchObject({ unavailable: true, availability: "unknown" });
  });
});

describe("HomeAssistantDriver with the new domains", () => {
  const states: Record<string, { state: string; attributes: Record<string, unknown> }> = {};
  let calls: { url: string; method: string; body: string }[];

  function device(entityId: string, category: Device["category"], capabilities: CapabilityId[]): Device {
    return { id: `d-${entityId}`, name: entityId, category, manufacturer: "Home Assistant", driverId: HOME_ASSISTANT_DRIVER_ID, capabilities, config: { baseUrl: BASE, token: "tok", entityId } };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    resetTemperatureUnitsForTests();
    calls = [];
    global.fetch = jest.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET", body: String(init?.body ?? "") });
      if (url.endsWith("/api/config")) return { ok: true, status: 200, json: async () => ({ unit_system: { temperature: "°F" } }) } as Response;
      const id = url.split("/api/states/")[1];
      return { ok: true, status: 200, json: async () => (id ? { entity_id: id, ...states[id] } : []) } as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("a lock command posts to lock.unlock and re-reads the state", async () => {
    states["lock.front"] = { state: "locked", attributes: {} };
    const driver = new HomeAssistantDriver();
    const lock = device("lock.front", "lock", ["lock", "unlock"]);
    await driver.connect(lock);
    states["lock.front"] = { state: "unlocked", attributes: {} };
    const result = await driver.executeCommand(lock, command("unlock"));
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/api/services/lock/unlock") && c.body === JSON.stringify({ entity_id: "lock.front" }))).toBe(true);
    expect(result.state).toMatchObject({ lockState: "unlocked" });
    await driver.disconnect(lock);
  });

  test("climate state is labelled with the unit from /api/config, fetched once", async () => {
    states["climate.hall"] = { state: "heat", attributes: { temperature: 70, hvac_modes: ["off", "heat"] } };
    const driver = new HomeAssistantDriver();
    const climate = device("climate.hall", "climate", ["setTemperature"]);
    await driver.connect(climate);
    await driver.executeCommand(climate, command("setTemperature", { temperature: 71 }));
    expect((await driver.getState(climate)).values).toMatchObject({ temperatureUnit: "°F", temperature: 70 });
    expect(calls.filter((c) => c.url.endsWith("/api/config"))).toHaveLength(1);
    await driver.disconnect(climate);
  });

  test("an unavailable entity connects as disconnected with no power reading, and unknown as unknown", async () => {
    states["switch.gone"] = { state: "unavailable", attributes: {} };
    states["sensor.new"] = { state: "unknown", attributes: { unit_of_measurement: "W" } };
    const driver = new HomeAssistantDriver();
    const gone = device("switch.gone", "outlet", ["power"]);
    const sensor = device("sensor.new", "sensor", []);
    await driver.connect(gone);
    await driver.connect(sensor);
    const goneState = await driver.getState(gone);
    expect(goneState.connection).toBe("disconnected");
    expect(goneState.values).not.toHaveProperty("power");
    expect((await driver.getState(sensor)).connection).toBe("unknown");
    await driver.disconnect(gone);
    await driver.disconnect(sensor);
  });

  test("an unavailable entity keeps polling so it recovers when it comes back", async () => {
    states["cover.door"] = { state: "unavailable", attributes: {} };
    const driver = new HomeAssistantDriver();
    const cover = device("cover.door", "cover", ["open"]);
    await driver.connect(cover);
    const unsubscribe = driver.subscribeToState(cover, () => undefined);
    states["cover.door"] = { state: "open", attributes: { supported_features: 3 } };
    await jest.advanceTimersByTimeAsync(10_000);
    expect((await driver.getState(cover)).connection).toBe("connected");
    unsubscribe();
    await driver.disconnect(cover);
  });
});
