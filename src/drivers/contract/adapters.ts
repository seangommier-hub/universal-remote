// One adapter per driver: how to construct it, a fresh Device for it, what the fake network says
// when the device is "up", and one command that really needs the network. The behavioral
// assertions themselves live in driverContract.test.ts and are identical for every adapter.

import { DeviceDriver } from "../../core/drivers/DeviceDriver";
import { Command } from "../../core/types/Command";
import { Device } from "../../core/types/Device";
import { FakeReply, FccConfig, Responder, SocketProtocol } from "../../testUtils/contractNetwork";
import { SonosDriver } from "../audio/sonos/SonosDriver";
import { SquirrelFeederDriver } from "../feeder/squirrelFeeder/SquirrelFeederDriver";
import { Ps5Driver } from "../gaming/ps5/Ps5Driver";
import { XboxDriver } from "../gaming/xbox/XboxDriver";
import { BroadlinkIrDriver } from "../irHub/broadlink/BroadlinkIrDriver";
import { HueLightDriver } from "../lighting/hue/HueLightDriver";
import { KasaPlugDriver } from "../outlet/kasa/KasaPlugDriver";
import { SmartThingsOutletDriver } from "../outlet/smartthings/SmartThingsOutletDriver";
import { ChromecastDriver } from "../streaming/chromecast/ChromecastDriver";
import { RokuEcpDriver } from "../streaming/roku/RokuEcpDriver";
import { AppleTvDriver } from "../tv/appletv/AppleTvDriver";
import { DenonDriver } from "../tv/denon/DenonDriver";
import { LgWebOsDriver } from "../tv/lg/LgWebOsDriver";
import { SamsungTizenDriver } from "../tv/samsung/SamsungTizenDriver";
import { SonyBraviaDriver } from "../tv/sony/SonyBraviaDriver";
import { YamahaMusicCastDriver } from "../tv/yamaha/YamahaMusicCastDriver";
import { SwitchBotVacuumDriver } from "../vacuum/switchbot/SwitchBotVacuumDriver";
import {
  COMMAND_FAILURE_NOT_TRACKED,
  LG_COMMAND_TIMEOUT_NOT_LIVENESS,
  NO_PROBE_DRIVER_EXEMPTIONS,
  SAMSUNG_NO_LIVENESS,
  SOCKET_TV_SHARED_BUGS,
  STATELESS_HTTP_RETRY_EXEMPTION,
  UNDEDUPED_CONNECT_EXEMPTIONS,
  DriverExemptions,
  hangingRequestBug,
} from "./exemptions";

export const FCC_TEST_CONFIG: FccConfig = { baseUrl: "http://fcc.test:3210", token: "contract-token" };

export interface DriverAdapter {
  name: string;
  createDriver: () => DeviceDriver;
  /** A fresh Device every call: several drivers mutate device.config (self-healing IP, saved tokens). */
  createDevice: () => Device;
  /** What the fake network replies while "up". Unused for socket-only drivers. */
  responder?: Responder;
  socketProtocol?: SocketProtocol;
  /** True when the driver reaches its device through Family Command Center rather than directly. */
  usesFcc: boolean;
  /** A command that must touch the network to succeed. */
  command: Command;
  /** True for a driver that holds a persistent socket (adds the socket-specific cases). */
  persistentSocket?: boolean;
  exemptions: DriverExemptions;
}

function device(id: string, config: Record<string, unknown>): () => Device {
  return () => ({ id, name: `Contract ${id}`, category: "tv", manufacturer: "Contract", driverId: "contract", capabilities: [], config: { ...config } });
}

function bodyOf(init: RequestInit | undefined): string {
  return typeof init?.body === "string" ? init.body : "";
}

function headerOf(init: RequestInit | undefined, name: string): string {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return headers[name] ?? "";
}

const sonyResponder: Responder = (_url, init) => {
  const method = (JSON.parse(bodyOf(init) || "{}") as { method?: string }).method;
  if (method === "getPowerStatus") return { json: { result: [{ status: "active" }], id: 1 } };
  if (method === "getVolumeInformation") return { json: { result: [{ target: "speaker", volume: 20, mute: false, maxVolume: 100, minVolume: 0 }], id: 1 } };
  if (method === "getCurrentExternalInputsStatus") return { json: { result: [[]], id: 1 } };
  return { json: { result: [], id: 1 } };
};

const rokuResponder: Responder = (url) => {
  if (url.includes("/query/device-info")) return { text: "<device-info><power-mode>PowerOn</power-mode><model-name>Roku Ultra</model-name></device-info>" };
  if (url.includes("/query/media-player")) return { text: '<player error="false" state="play"><position>0 ms</position></player>' };
  if (url.includes("/query/apps")) return { text: '<apps><app id="12" type="appl" version="1.0">Netflix</app></apps>' };
  if (url.includes("/query/active-app")) return { text: "<active-app><app>Roku</app></active-app>" };
  return { text: "" };
};

const denonResponder: Responder = () => ({
  text: '<?xml version="1.0" encoding="utf-8" ?><item><Power><value>ON</value></Power><MasterVolume><value>-50</value></MasterVolume><Mute><value>off</value></Mute></item>',
});

const yamahaResponder: Responder = (url) => {
  if (url.includes("getStatus")) return { json: { response_code: 0, power: "on", volume: 30, max_volume: 100, mute: false, input: "hdmi1" } };
  if (url.includes("getFeatures")) return { json: { response_code: 0, zone: [{ id: "main", input_list: ["hdmi1"] }] } };
  return { json: { response_code: 0 } };
};

const sonosResponder: Responder = (_url, init) => {
  const action = headerOf(init, "SOAPACTION");
  if (action.endsWith("#GetVolume")) return { text: "<CurrentVolume>20</CurrentVolume>" };
  if (action.endsWith("#GetMute")) return { text: "<CurrentMute>0</CurrentMute>" };
  if (action.endsWith("#GetTransportInfo")) return { text: "<CurrentTransportState>PLAYING</CurrentTransportState>" };
  return { text: "<ok/>" };
};

const hueResponder: Responder = (url, init) => {
  if (init?.method === "PUT") return { json: [{ success: {} }] };
  if (url.includes("/lights/")) return { json: { state: { on: true, bri: 200, hue: 100, sat: 100, reachable: true }, name: "Lamp" } };
  return { json: {} };
};

const feederResponder: Responder = (url) =>
  url.includes("/status")
    ? { json: { online: true, uptime: 1, wifi_rssi: -50, feeder_state: "IDLE", detections: 0, dispenses: 0, cooldown_active: false } }
    : { json: {} };

const switchBotReply: FakeReply = {
  json: { statusCode: 100, message: "success", body: { deviceId: "sb-1", deviceType: "K10+", workingStatus: "Standby", onlineStatus: "online", battery: 90 } },
};

const kasaResponder: Responder = (url) => (url.includes("sysinfo") ? { json: { relayState: true, alias: "Plug", model: "HS103" } } : { json: {} });

const smartThingsResponder: Responder = (url, init) => (init?.method === "POST" ? { json: {} } : { json: { outlets: [{ id: "st-1", state: "on" }] } });

const anyCommand = (capability: Command["capability"]): Command => ({ deviceId: "contract", capability });

export const DRIVER_ADAPTERS: DriverAdapter[] = [
  { name: "LgWebOsDriver", createDriver: () => new LgWebOsDriver(), createDevice: device("lg-1", { ipAddress: "192.168.1.70" }), socketProtocol: "lg", persistentSocket: true, usesFcc: false, command: anyCommand("volumeUp"), exemptions: { ...SOCKET_TV_SHARED_BUGS, commandFailureMarksDisconnected: LG_COMMAND_TIMEOUT_NOT_LIVENESS } },
  { name: "SamsungTizenDriver", createDriver: () => new SamsungTizenDriver(), createDevice: device("samsung-1", { ipAddress: "192.168.1.60" }), socketProtocol: "samsung", persistentSocket: true, usesFcc: false, command: anyCommand("volumeUp"), exemptions: {
      ...SOCKET_TV_SHARED_BUGS,
      commandWhileHungRejects: SAMSUNG_NO_LIVENESS,
      commandFailureMarksDisconnected: SAMSUNG_NO_LIVENESS,
      silentDeathDetected: SAMSUNG_NO_LIVENESS,
    } },
  { name: "SonyBraviaDriver", createDriver: () => new SonyBraviaDriver(), createDevice: device("sony-1", { ipAddress: "192.168.1.50", psk: "psk" }), responder: sonyResponder, usesFcc: false, command: anyCommand("volumeUp"), exemptions: COMMAND_FAILURE_NOT_TRACKED },
  { name: "RokuEcpDriver", createDriver: () => new RokuEcpDriver(), createDevice: device("roku-1", { ipAddress: "192.168.1.80" }), responder: rokuResponder, usesFcc: false, command: anyCommand("volumeUp"), exemptions: {} },
  { name: "DenonDriver", createDriver: () => new DenonDriver(), createDevice: device("denon-1", { ipAddress: "192.168.1.81" }), responder: denonResponder, usesFcc: false, command: anyCommand("volumeUp"), exemptions: COMMAND_FAILURE_NOT_TRACKED },
  { name: "YamahaMusicCastDriver", createDriver: () => new YamahaMusicCastDriver(), createDevice: device("yamaha-1", { ipAddress: "192.168.1.60" }), responder: yamahaResponder, usesFcc: false, command: anyCommand("volumeUp"), exemptions: COMMAND_FAILURE_NOT_TRACKED },
  { name: "SonosDriver", createDriver: () => new SonosDriver(), createDevice: device("sonos-1", { ipAddress: "192.168.1.82" }), responder: sonosResponder, usesFcc: false, command: anyCommand("volumeUp"), exemptions: COMMAND_FAILURE_NOT_TRACKED },
  { name: "ChromecastDriver", createDriver: () => new ChromecastDriver(), createDevice: device("cast-1", { ipAddress: "192.168.1.83" }), responder: () => ({ json: { volumeLevel: 0.3, muted: false } }), usesFcc: true, command: anyCommand("volumeUp"), exemptions: {
      ...COMMAND_FAILURE_NOT_TRACKED,
      ...{},
    } },
  { name: "AppleTvDriver", createDriver: () => new AppleTvDriver(), createDevice: device("atv-1", { ipAddress: "192.168.1.90" }), responder: () => ({ json: { output: "PowerState.On" } }), usesFcc: true, command: anyCommand("select"), exemptions: {} },
  { name: "KasaPlugDriver", createDriver: () => new KasaPlugDriver(), createDevice: device("kasa-1", { ipAddress: "192.168.1.50" }), responder: kasaResponder, usesFcc: true, command: anyCommand("power"), exemptions: {} },
  { name: "SmartThingsOutletDriver", createDriver: () => new SmartThingsOutletDriver(), createDevice: device("st-1", { deviceId: "st-1" }), responder: smartThingsResponder, usesFcc: true, command: anyCommand("power"), exemptions: {
      ...UNDEDUPED_CONNECT_EXEMPTIONS,
      retryAfterFailure: {
        kind: "bug",
        bug: 12,
        reason: "no retry after a failed connect and no ADR records that as intended (Hue and the feeder do have one); the same gap was fixed for Kasa and Apple TV",
      },
    } },
  { name: "HueLightDriver", createDriver: () => new HueLightDriver(), createDevice: device("hue-1", { bridgeIpAddress: "192.168.1.2", username: "u", lightId: "1" }), responder: hueResponder, usesFcc: false, command: anyCommand("power"), exemptions: { ...UNDEDUPED_CONNECT_EXEMPTIONS, retryAfterFailure: STATELESS_HTTP_RETRY_EXEMPTION } },
  { name: "SquirrelFeederDriver", createDriver: () => new SquirrelFeederDriver(), createDevice: device("feeder-1", { ipAddress: "192.168.1.84" }), responder: feederResponder, usesFcc: false, command: anyCommand("dispense"), exemptions: { ...UNDEDUPED_CONNECT_EXEMPTIONS, retryAfterFailure: STATELESS_HTTP_RETRY_EXEMPTION } },
  { name: "SwitchBotVacuumDriver", createDriver: () => new SwitchBotVacuumDriver(), createDevice: device("sb-1", { token: "t", secret: "s", deviceId: "sb-1" }), responder: () => switchBotReply, usesFcc: false, command: anyCommand("vacuumStart"), exemptions: hangingRequestBug(4, "SwitchBotClient (SwitchBotClient.ts:93/99/104)", ["connectHangRejects", "commandWhileHungRejects"]) },
  { name: "BroadlinkIrDriver", createDriver: () => new BroadlinkIrDriver(), createDevice: device("bl-1", { ipAddress: "192.168.1.85", codes: { power: "2600" } }), responder: () => ({ json: {} }), usesFcc: true, command: anyCommand("power"), exemptions: {
      ...NO_PROBE_DRIVER_EXEMPTIONS,
      ...{},
    } },
  { name: "XboxDriver", createDriver: () => new XboxDriver(), createDevice: device("xbox-1", { liveId: "FD0000000000", ipAddress: "192.168.1.86" }), responder: () => ({ json: {} }), usesFcc: true, command: anyCommand("powerOn"), exemptions: {
      ...NO_PROBE_DRIVER_EXEMPTIONS,
      ...{},
    } },
  { name: "Ps5Driver", createDriver: () => new Ps5Driver(), createDevice: device("ps5-1", { ipAddress: "192.168.1.87" }), responder: () => ({ json: {} }), usesFcc: true, command: anyCommand("powerOn"), exemptions: {
      ...NO_PROBE_DRIVER_EXEMPTIONS,
      ...{},
    } },
];
