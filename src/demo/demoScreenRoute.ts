import { Device } from "../core/types/Device";
import type { DevicesScreen } from "../ui/DevicesTabScreen";
import { BrandId, isBrandId } from "../discovery/brandRegistry";
import { demoActivities } from "./demoHousehold";
import { demoScreenParam } from "./demoMode";

// ADR-HEARTH-157: demo-only deep entry (?demo=1&screen=...). The app navigates by internal state, not URLs.
// Grammar: list | discover | fcc-settings | activity-editor | remote:<key> | post-add:<key> | setup-checks:<key> | add:<brand>
// where <key> is a fragment of a demo device's name or id (lg, samsung, roku, sonos, kasa, broadlink).

function findDevice(devices: Device[], key: string): Device | undefined {
  const needle = key.toLowerCase();
  return devices.find((d) => d.id.toLowerCase().includes(needle) || d.name.toLowerCase().includes(needle));
}

/** Turns a ?screen= value into a starting screen, or null when it names nothing known. */
export function resolveDemoScreen(param: string | null, devices: Device[]): DevicesScreen | null {
  if (!param) return null;
  const [name, arg = ""] = param.split(":");
  const device = arg ? findDevice(devices, arg) : undefined;
  switch (name) {
    case "list":
    case "discover":
    case "fcc-settings":
      return { name };
    case "activity-editor":
      return { name: "edit-activity", editingActivity: demoActivities()[0] };
    case "remote":
      return device ? { name: "remote", device } : null;
    case "post-add":
      return device ? { name: "post-add", device, mode: "post-add" } : null;
    case "setup-checks":
      return device ? { name: "post-add", device, mode: "setup-checks" } : null;
    case "ha-sync":
      return { name: "add", brand: "homeassistant" };
    case "add":
      return isBrandId(arg) ? { name: "add", brand: arg as BrandId } : null;
    default:
      return null;
  }
}

/** The starting screen requested by the current URL in demo mode; null in every other case. */
export function demoStartingScreen(devices: Device[]): DevicesScreen | null {
  return resolveDemoScreen(demoScreenParam(), devices);
}
