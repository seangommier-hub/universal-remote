import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { ActivityIndicator, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { BrandId } from "../discovery/brandRegistry";
import { buildDiscoveryRows, DiscoveryRow } from "../discovery/discoveryRows";
import { BrandPickerModal } from "./BrandPickerModal";
import { CapabilityButton } from "./CapabilityButton";
import { DiscoveredDeviceRow } from "./DiscoveredDeviceRow";
import { NetworkFailureNotice } from "./NetworkFailureNotice";
import { theme } from "./theme";
import { useAddDiscoveredDevice } from "./useAddDiscoveredDevice";
import { scanNetworkQuietly, useNetworkDevices } from "./useNetworkDevices";

interface DiscoverDevicesScreenProps {
  driverRegistry: DriverRegistry;
  stateStore: StateStore;
  /** Devices already added, so they show as "Added" instead of disappearing. */
  devices: Device[];
  onCancel: () => void;
  onAdded: (device: Device) => void;
  /** Opens Family Command Center pairing/settings — for brands that need it and for widening coverage. */
  onOpenSettings: () => void;
  /** Opens a brand's own multi-step add screen with the address prefilled (Hue, PS5, Apple TV). */
  onOpenBrandScreen: (brand: BrandId, ipAddress: string) => void;
}

const EMPTY_ICON_SIZE = 36;

/**
 * Lists EVERY device on the network (ADR-HEARTH-148): identified devices first, then "Other
 * devices". Each row has one primary button — Add for a recognized brand, Identify for an unknown
 * one, "Added" for one already in Hearth. A failed scan says why instead of "No devices found".
 */
export function DiscoverDevicesScreen({ driverRegistry, stateStore, devices, onCancel, onAdded, onOpenSettings, onOpenBrandScreen }: DiscoverDevicesScreenProps) {
  const insets = useSafeAreaInsets();
  const network = useNetworkDevices();
  const add = useAddDiscoveredDevice({
    driverRegistry,
    stateStore,
    onAdded,
    onOpenBrandScreen,
    onIdentified: network.replaceDevice,
    rescan: scanNetworkQuietly,
  });
  const rows = useMemo(() => buildDiscoveryRows(network.devices, devices), [network.devices, devices]);
  const sections = [
    { title: "Identified devices", data: rows.identified },
    { title: "Other devices", data: rows.other },
  ].filter((section) => section.data.length > 0);
  const isScanning = network.status === "scanning";

  const renderRow = ({ item }: { item: DiscoveryRow }) => (
    <DiscoveredDeviceRow row={item} ui={add.uiFor(item.device.id)} onPrimary={add.press} onSubmitFields={add.submitFields} onOpenFccSetup={onOpenSettings} />
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + theme.spacing.lg }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Discover Devices</Text>
        <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
      <Text style={styles.subtitle}>Everything on your network — pull down to scan again</Text>

      {isScanning && network.devices.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.accentEnd} size="large" />
          <Text style={styles.scanningText}>Scanning...</Text>
        </View>
      ) : network.devices.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="search-outline" size={EMPTY_ICON_SIZE} color={theme.textTertiary} />
          {network.failure ? (
            <>
              <Text style={styles.body}>The scan couldn't finish — this isn't the same as finding no devices.</Text>
              <NetworkFailureNotice diagnosis={network.failure} />
            </>
          ) : (
            <Text style={styles.body}>No devices found on your network right now.</Text>
          )}
          <CapabilityButton label="Try Again" variant="accent" onPress={() => void network.rescan()} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(row) => row.device.id}
          contentContainerStyle={styles.list}
          refreshing={isScanning}
          onRefresh={() => void network.rescan()}
          ListHeaderComponent={network.failure ? <NetworkFailureNotice diagnosis={network.failure} /> : null}
          renderSectionHeader={({ section }) => <Text style={styles.sectionLabel}>{section.title}</Text>}
          renderItem={renderRow}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          stickySectionHeadersEnabled={false}
        />
      )}

      <BrandPickerModal row={add.pickerRow} onPick={add.pickBrand} onCancel={add.closePicker} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background, paddingHorizontal: theme.spacing.xl },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: theme.spacing.xs },
  title: { color: theme.textPrimary, fontSize: theme.type.title, fontWeight: "700" },
  subtitle: { color: theme.textSecondary, fontSize: theme.type.label, marginBottom: theme.spacing.lg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md, paddingVertical: theme.spacing.xxl },
  scanningText: { color: theme.textSecondary, fontSize: theme.type.body },
  body: { color: theme.textSecondary, fontSize: theme.type.label, textAlign: "center", paddingHorizontal: theme.spacing.xl },
  list: { paddingBottom: theme.spacing.xl },
  separator: { height: theme.spacing.md },
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
