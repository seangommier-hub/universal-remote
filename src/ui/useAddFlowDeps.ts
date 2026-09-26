import { useMemo } from "react";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { StateStore } from "../core/state/StateStore";
import { AddFlowDependencies } from "../discovery/addDeviceFlow";
import { setNameSource } from "../discovery/deviceNameSource";
import { loadFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import { identifyDeviceByIp } from "../discovery/identifyDevice";

/** The one set of dependencies every "connect a device by address" caller on the Discover and Suggested screens shares (ADR-HEARTH-148). */
export function useAddFlowDeps(driverRegistry: DriverRegistry, stateStore: StateStore): AddFlowDependencies {
  return useMemo<AddFlowDependencies>(
    () => ({
      driverRegistry,
      readReportedName: (id) => {
        const value = stateStore.get(id).values.deviceName;
        return typeof value === "string" ? value : undefined;
      },
      hasFccConfig: async () => (await loadFamilyCommandCenterConfig()) !== null,
      identify: identifyDeviceByIp,
      recordNameSource: (id, source) => void setNameSource(id, source),
    }),
    [driverRegistry, stateStore]
  );
}
