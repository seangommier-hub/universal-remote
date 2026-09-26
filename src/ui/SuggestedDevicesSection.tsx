import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { BrandId } from "../discovery/brandRegistry";
import { buildDiscoveryRows, notYetAdded } from "../discovery/discoveryRows";
import { BrandPickerModal } from "./BrandPickerModal";
import { DiscoveredDeviceRow } from "./DiscoveredDeviceRow";
import { theme } from "./theme";
import { useAddDiscoveredDevice } from "./useAddDiscoveredDevice";
import { scanNetworkQuietly, useNetworkDevices } from "./useNetworkDevices";

interface SuggestedDevicesSectionProps {
  driverRegistry: DriverRegistry;
  stateStore: StateStore;
  devices: Device[];
  onAdded: (device: Device) => void;
  onOpenBrandScreen: (brand: BrandId, ipAddress: string) => void;
  onOpenFccSetup: () => void;
}

/**
 * Home "Suggested From Your Network" (ADR-HEARTH-092, reworked by ADR-HEARTH-148): every device on
 * the network that isn't added yet, recognized ones first, each with the same single button the
 * Discover screen uses. Renders nothing until a scan finds something — never an error, since this
 * is a convenience; the Discover screen is where a failed scan is explained.
 */
export function SuggestedDevicesSection({ driverRegistry, stateStore, devices, onAdded, onOpenBrandScreen, onOpenFccSetup }: SuggestedDevicesSectionProps) {
  const network = useNetworkDevices();
  const add = useAddDiscoveredDevice({ driverRegistry, stateStore, onAdded, onOpenBrandScreen, onIdentified: network.replaceDevice, rescan: scanNetworkQuietly });
  const suggested = useMemo(() => notYetAdded(buildDiscoveryRows(network.devices, devices)), [network.devices, devices]);

  if (suggested.length === 0) return null;
  return (
    <>
      <Text style={styles.sectionLabel}>Suggested From Your Network</Text>
      <View style={styles.list}>
        {suggested.map((row) => (
          <DiscoveredDeviceRow key={row.device.id} row={row} ui={add.uiFor(row.device.id)} onPrimary={add.press} onSubmitFields={add.submitFields} onOpenFccSetup={onOpenFccSetup} />
        ))}
      </View>
      <BrandPickerModal row={add.pickerRow} onPick={add.pickBrand} onCancel={add.closePicker} />
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.md, paddingBottom: theme.spacing.md },
  sectionLabel: {
    color: theme.textSecondary,
    fontSize: theme.type.label,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
});
