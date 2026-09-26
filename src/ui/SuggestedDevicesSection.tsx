import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { BrandId } from "../discovery/brandRegistry";
import { buildSections, pickSuggested } from "../discovery/discoverySections";
import { BrandPickerModal } from "./BrandPickerModal";
import { DiscoveredDeviceRow } from "./DiscoveredDeviceRow";
import { theme } from "./theme";
import { useAddDiscoveredDevice } from "./useAddDiscoveredDevice";
import { useDeviceLabels } from "./useDeviceLabels";
import { scanNetworkQuietly, useNetworkDevices } from "./useNetworkDevices";

interface SuggestedDevicesSectionProps {
  driverRegistry: DriverRegistry;
  stateStore: StateStore;
  devices: Device[];
  onAdded: (device: Device) => void;
  onOpenBrandScreen: (brand: BrandId, ipAddress: string) => void;
  onOpenFccSetup: () => void;
  /** Opens the Discover screen, where the full list lives. */
  onSeeAll: () => void;
}

const MIN_TARGET = 44;
const CHEVRON_SIZE = 16;

function seeAllLabel(count: number): string {
  return `See all ${count} ${count === 1 ? "device" : "devices"} on your network`;
}

/**
 * Home "Suggested" (ADR-HEARTH-092, 148, 153): only the top few recognized, ready-to-add devices,
 * plus one link to the Discover screen for everything else. Renders nothing until a scan finds
 * something recognized and addable — never an error; the Discover screen is where a failed scan is explained.
 */
export function SuggestedDevicesSection({ driverRegistry, stateStore, devices, onAdded, onOpenBrandScreen, onOpenFccSetup, onSeeAll }: SuggestedDevicesSectionProps) {
  const network = useNetworkDevices();
  const { labels } = useDeviceLabels();
  const add = useAddDiscoveredDevice({ driverRegistry, stateStore, onAdded, onOpenBrandScreen, onIdentified: network.replaceDevice, rescan: scanNetworkQuietly });
  const sections = useMemo(() => buildSections(network.devices, devices, labels), [network.devices, devices, labels]);
  const { top, remaining } = pickSuggested(sections);

  if (top.length === 0) return null;
  return (
    <>
      <Text style={styles.sectionLabel} accessibilityRole="header">
        Suggested From Your Network
      </Text>
      <View style={styles.list}>
        {top.map((row) => (
          <DiscoveredDeviceRow key={row.device.id} row={row} ui={add.uiFor(row.device.id)} onPrimary={add.press} onSubmitFields={add.submitFields} onOpenFccSetup={onOpenFccSetup} />
        ))}
      </View>
      {remaining > 0 && (
        <Pressable style={styles.seeAll} onPress={onSeeAll} accessibilityRole="button" accessibilityLabel={seeAllLabel(top.length + remaining)}>
          <Text style={styles.seeAllLabel}>{seeAllLabel(top.length + remaining)}</Text>
          <Ionicons name="chevron-forward" size={CHEVRON_SIZE} color={theme.accentEnd} />
        </Pressable>
      )}
      <BrandPickerModal row={add.pickerRow} onPick={add.pickBrand} onCancel={add.closePicker} />
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  seeAll: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, minHeight: MIN_TARGET },
  seeAllLabel: { color: theme.accentEnd, fontSize: theme.type.label, fontWeight: "600" },
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
