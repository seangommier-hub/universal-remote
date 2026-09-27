import { HomeAssistantEntity } from "./HomeAssistantClient";
import { HaCommandValidationError, commandToServiceCall } from "./haCommandMapping";
import { capabilitiesForEntity, importSupportedEntities } from "./haEntityMapping";
import { buildHomeAssistantDevice } from "./haDeviceFactory";
import { entityToValues } from "./haStateMapping";

function entity(entityId: string, state = "on", attributes: Record<string, unknown> = {}): HomeAssistantEntity {
  return { entity_id: entityId, state, attributes };
}

const MEDIA_ALL = 1 | 4 | 8 | 128 | 256 | 1024 | 2048;

describe("capabilitiesForEntity", () => {
  test("a switch only gets power", () => {
    expect(capabilitiesForEntity(entity("switch.plug"))).toEqual(["power"]);
  });

  test("an on/off-only light gets no brightness or color", () => {
    expect(capabilitiesForEntity(entity("light.hall", "on", { supported_color_modes: ["onoff"] }))).toEqual(["power"]);
  });

  test("a dimmable light gets brightness but not color", () => {
    expect(capabilitiesForEntity(entity("light.lamp", "on", { supported_color_modes: ["brightness"] }))).toEqual(["power", "setBrightness"]);
  });

  test("a color light gets brightness and color", () => {
    expect(capabilitiesForEntity(entity("light.rgb", "on", { supported_color_modes: ["color_temp", "hs"] }))).toEqual(["power", "setBrightness", "setColor"]);
  });

  test("a media player with every feature bit gets the full set", () => {
    const capabilities = capabilitiesForEntity(entity("media_player.tv", "on", { supported_features: MEDIA_ALL }));
    expect(capabilities).toEqual(["power", "setVolume", "volumeUp", "volumeDown", "mute", "playPause", "inputSelection"]);
  });

  test("a media player that can only turn off gets powerOff and nothing it lacks", () => {
    expect(capabilitiesForEntity(entity("media_player.old", "on", { supported_features: 256 }))).toEqual(["powerOff"]);
  });

  test("a media player with no supported_features gets nothing", () => {
    expect(capabilitiesForEntity(entity("media_player.bare"))).toEqual([]);
  });
});

describe("importSupportedEntities", () => {
  test("keeps only driveable domains, skips empty capability sets, names from friendly_name, sorted", () => {
    const imported = importSupportedEntities([
      entity("sensor.temp"),
      entity("cover.garage"),
      entity("switch.b", "off", { friendly_name: "Zed plug" }),
      entity("switch.a"),
      entity("media_player.bare"),
      entity("remote.harmony", "on", { friendly_name: "Harmony" }),
    ]);
    expect(imported.map((e) => e.name)).toEqual(["Harmony", "switch.a", "Zed plug"]);
    expect(imported.find((e) => e.entityId === "remote.harmony")?.capabilities).toContain("directionalNavigation");
  });
});

describe("entityToValues", () => {
  test("maps a media player's volume, mute, source, list and playback", () => {
    const values = entityToValues(entity("media_player.tv", "playing", { volume_level: 0.35, is_volume_muted: true, source: "HDMI 1", source_list: ["HDMI 1", "TV"], friendly_name: "TV" }));
    expect(values).toMatchObject({ power: "on", volume: 35, muted: true, input: "HDMI 1", playbackState: "playing", inputs: [{ id: "HDMI 1", label: "HDMI 1" }, { id: "TV", label: "TV" }] });
  });

  test("maps a light's brightness to a percentage and its hue and saturation", () => {
    expect(entityToValues(entity("light.a", "on", { brightness: 255, hs_color: [120, 50] }))).toMatchObject({ power: "on", brightness: 100, hue: 120, saturation: 50 });
  });

  test("an unavailable entity reads as off and flagged unavailable", () => {
    expect(entityToValues(entity("switch.a", "unavailable"))).toMatchObject({ power: "off", unavailable: true });
  });
});

describe("commandToServiceCall", () => {
  test("power toggles through the entity's own domain", () => {
    expect(commandToServiceCall({ deviceId: "d", capability: "power" }, "switch.a", {})).toEqual({ domain: "switch", service: "toggle", data: { entity_id: "switch.a" } });
  });

  test("setVolume converts percent to a 0-1 level", () => {
    expect(commandToServiceCall({ deviceId: "d", capability: "setVolume", args: { volume: 40 } }, "media_player.tv", {}).data).toEqual({ entity_id: "media_player.tv", volume_level: 0.4 });
  });

  test("mute flips the last known muted value", () => {
    expect(commandToServiceCall({ deviceId: "d", capability: "mute" }, "media_player.tv", { muted: true }).data.is_volume_muted).toBe(false);
  });

  test("setColor sends hs_color and setBrightness sends brightness_pct", () => {
    expect(commandToServiceCall({ deviceId: "d", capability: "setColor", args: { hue: 10, saturation: 20 } }, "light.a", {}).data.hs_color).toEqual([10, 20]);
    expect(commandToServiceCall({ deviceId: "d", capability: "setBrightness", args: { brightness: 70 } }, "light.a", {}).data.brightness_pct).toBe(70);
  });

  test("remote navigation sends the direction as a command", () => {
    expect(commandToServiceCall({ deviceId: "d", capability: "directionalNavigation", args: { direction: "up" } }, "remote.h", {})).toEqual({ domain: "remote", service: "send_command", data: { entity_id: "remote.h", command: ["up"] } });
  });

  test("a missing argument or unsupported capability is a validation error", () => {
    expect(() => commandToServiceCall({ deviceId: "d", capability: "setVolume" }, "media_player.tv", {})).toThrow(HaCommandValidationError);
    expect(() => commandToServiceCall({ deviceId: "d", capability: "volumeUp" }, "switch.a", {})).toThrow(HaCommandValidationError);
  });
});

describe("buildHomeAssistantDevice", () => {
  test("references the shared instance and entity id, holds no token, and keeps the entity's capabilities", () => {
    const [imported] = importSupportedEntities([entity("light.a", "on", { supported_color_modes: ["brightness"] })]);
    const device = buildHomeAssistantDevice(imported, { id: "ha-http-homeassistant.local-8123", baseUrl: "http://homeassistant.local:8123", token: "secret" }, 1);
    expect(device.config).toEqual({ instanceId: "ha-http-homeassistant.local-8123", entityId: "light.a" });
    expect(device.category).toBe("lighting");
    expect(device.capabilities).toEqual(["power", "setBrightness"]);
  });
});
