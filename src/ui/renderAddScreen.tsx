import { ReactElement } from "react";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { BrandId, getBrand } from "../discovery/brandRegistry";
import { AddAndroidTvDeviceScreen } from "./AddAndroidTvDeviceScreen";
import { AddAppleTvDeviceScreen } from "./AddAppleTvDeviceScreen";
import { AddHomeAssistantScreen } from "./AddHomeAssistantScreen";
import { AddHueDeviceScreen } from "./AddHueDeviceScreen";
import { AddPs5DeviceScreen } from "./AddPs5DeviceScreen";
import { AddSmartThingsOutletsScreen } from "./AddSmartThingsOutletsScreen";
import { AddSonyDeviceScreen } from "./AddSonyDeviceScreen";
import { AddSwitchBotVacuumScreen } from "./AddSwitchBotVacuumScreen";
import { AddVizioDeviceScreen } from "./AddVizioDeviceScreen";
import { AddXboxDeviceScreen } from "./AddXboxDeviceScreen";
import { GenericIpAddDeviceScreen } from "./GenericIpAddDeviceScreen";

export interface AddScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  /** Adds several devices at once without opening any of them (used by "Sync from Home Assistant"); returns them as stored. */
  onImported?: (devices: Device[]) => Device[];
  /** Devices already in Hearth, for screens that offer only what is not yet added. */
  existingDevices?: Device[];
  initialIpAddress?: string;
  onOpenFccSetup: () => void;
}

/**
 * Picks the add screen for a brand (ADR-HEARTH-148). Only the brands with a genuinely different
 * flow (a secret to type, an on-device approval, an account token) have their own screen; every
 * brand whose only input is an address goes through the one registry-driven generic screen.
 */
export function renderAddScreen(brandId: BrandId, props: AddScreenProps): ReactElement {
  const { onOpenFccSetup, ...screenProps } = props;
  switch (brandId) {
    case "sony":
      return <AddSonyDeviceScreen {...screenProps} />;
    case "xbox":
      return <AddXboxDeviceScreen {...screenProps} />;
    case "appletv":
      return <AddAppleTvDeviceScreen {...screenProps} />;
    case "vizio":
      return <AddVizioDeviceScreen {...screenProps} />;
    case "androidtv":
      return <AddAndroidTvDeviceScreen {...screenProps} />;
    case "ps5":
      return <AddPs5DeviceScreen {...screenProps} />;
    case "hue":
      return <AddHueDeviceScreen {...screenProps} />;
    case "switchbot":
      return <AddSwitchBotVacuumScreen {...screenProps} />;
    case "smartthings":
      return <AddSmartThingsOutletsScreen {...screenProps} />;
    case "homeassistant":
      return <AddHomeAssistantScreen {...screenProps} />;
    default:
      return <GenericIpAddDeviceScreen brand={getBrand(brandId)} {...screenProps} onOpenFccSetup={onOpenFccSetup} />;
  }
}
