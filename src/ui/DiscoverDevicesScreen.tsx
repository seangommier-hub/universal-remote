import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { BrandEntry, BrandId } from "../discovery/brandRegistry";
import { DiscoveryRow } from "../discovery/discoveryRows";
import { buildListItems, buildSections, formatScannedAgo, ListItem, pickScreenState, shouldShowSearch } from "../discovery/discoverySections";
import { BrandPickerModal } from "./BrandPickerModal";
import { CapabilityButton } from "./CapabilityButton";
import { DiscoverEmptyState } from "./DiscoverEmptyState";
import { NoMatchNotice, SectionHeader, ToggleRow } from "./DiscoverListItems";
import { DiscoveredDeviceRow } from "./DiscoveredDeviceRow";
import { NetworkFailureNotice } from "./NetworkFailureNotice";
import { RowActionsModal } from "./RowActionsModal";
import { theme } from "./theme";
import { useAddDiscoveredDevice } from "./useAddDiscoveredDevice";
import { useDeviceLabels } from "./useDeviceLabels";
import { scanNetworkQuietly, useNetworkDevices } from "./useNetworkDevices";

interface DiscoverDevicesScreenProps {
  driverRegistry: DriverRegistry;
  stateStore: StateStore;
  /** Devices already added, so they are left out of the list instead of offered twice. */
  devices: Device[];
  onCancel: () => void;
  onAdded: (device: Device) => void;
  /** Opens Family Command Center pairing/settings — for brands that need it and for widening coverage. */
  onOpenSettings: () => void;
  /** Opens a brand's own multi-step add screen with the address prefilled (Hue, PS5, Apple TV). */
  onOpenBrandScreen: (brand: BrandId, ipAddress: string) => void;
}

const CLOCK_TICK_MS = 5000;
const MIN_TARGET = 44;
const SEARCH_ICON_SIZE = 18;

/**
 * Every device on the network, calmly (ADR-HEARTH-148, ADR-HEARTH-153): "Ready to add" first,
 * recognized-but-off next, everything unrecognized collapsed behind one row and grouped by kind,
 * anything the person hid under "Hidden". One primary button per row, the rest in an overflow menu.
 */
export function DiscoverDevicesScreen({ driverRegistry, stateStore, devices, onCancel, onAdded, onOpenSettings, onOpenBrandScreen }: DiscoverDevicesScreenProps) {
  const insets = useSafeAreaInsets();
  const network = useNetworkDevices();
  const { labels, setHidden, setBrand } = useDeviceLabels();
  const add = useAddDiscoveredDevice({ driverRegistry, stateStore, onAdded, onOpenBrandScreen, onIdentified: network.replaceDevice, rescan: scanNetworkQuietly });
  const [query, setQuery] = useState("");
  const [otherExpanded, setOtherExpanded] = useState(false);
  const [hiddenExpanded, setHiddenExpanded] = useState(false);
  const [actionsRow, setActionsRow] = useState<DiscoveryRow | null>(null);
  const [relabelRow, setRelabelRow] = useState<DiscoveryRow | null>(null);
  const now = useClock();

  const sections = useMemo(() => buildSections(network.devices, devices, labels, query), [network.devices, devices, labels, query]);
  const searching = query.trim().length > 0;
  const items = useMemo(() => buildListItems(sections, { otherExpanded, hiddenExpanded, searching }), [sections, otherExpanded, hiddenExpanded, searching]);
  const screenState = pickScreenState({ status: network.status, deviceCount: network.devices.length, sections, failure: network.failure, fccConfigured: network.fccConfigured });
  const isScanning = network.status === "scanning";

  const pickForIdentify = (brand: BrandEntry) => {
    if (add.pickerRow) setBrand(add.pickerRow.device, brand.id);
    add.pickBrand(brand);
  };
  const pickForRelabel = (brand: BrandEntry) => {
    if (relabelRow) setBrand(relabelRow.device, brand.id);
    setRelabelRow(null);
  };
  const closeActionsThen = (action: (row: DiscoveryRow) => void) => (row: DiscoveryRow) => {
    setActionsRow(null);
    action(row);
  };

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === "header" || item.type === "subheader") return <SectionHeader title={item.title} count={item.count} minor={item.type === "subheader"} />;
    if (item.type === "toggle") return <ToggleRow item={item} onPress={() => (item.target === "other" ? setOtherExpanded((open) => !open) : setHiddenExpanded((open) => !open))} />;
    if (item.type === "no-match") return <NoMatchNotice />;
    return (
      <View style={styles.rowGap}>
        <DiscoveredDeviceRow row={item.row} ui={add.uiFor(item.row.device.id)} onPrimary={add.press} onSubmitFields={add.submitFields} onOpenFccSetup={onOpenSettings} onMore={setActionsRow} />
      </View>
    );
  };

  const listHeader = (
    <View style={styles.listHeader}>
      <ScanStatusLine scanning={isScanning} scannedAt={network.scannedAt} now={now} />
      {shouldShowSearch(sections) || searching ? <SearchBox value={query} onChange={setQuery} /> : null}
      {network.failure && screenState === "list" ? <NetworkFailureNotice diagnosis={network.failure} /> : null}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + theme.spacing.lg }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title} accessibilityRole="header">
          Devices on your network
        </Text>
        <CapabilityButton label="Done" variant="ghost" onPress={onCancel} />
      </View>

      {screenState === "list" ? (
        <FlatList
          data={items}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshing={isScanning}
          onRefresh={() => void network.rescan()}
          ListHeaderComponent={listHeader}
          keyboardShouldPersistTaps="handled"
        />
      ) : (
        <DiscoverEmptyState kind={screenState} failure={network.failure} onRetry={() => void network.rescan()} onOpenSettings={onOpenSettings} />
      )}

      <RowActionsModal
        row={actionsRow}
        onHide={closeActionsThen((row) => setHidden(row.device, true))}
        onShowAgain={closeActionsThen((row) => setHidden(row.device, false))}
        onChooseBrand={closeActionsThen(setRelabelRow)}
        onClose={() => setActionsRow(null)}
      />
      <BrandPickerModal row={relabelRow} onPick={pickForRelabel} onCancel={() => setRelabelRow(null)} />
      <BrandPickerModal row={add.pickerRow} onPick={pickForIdentify} onCancel={add.closePicker} />
    </View>
  );
}

function useClock(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function ScanStatusLine({ scanning, scannedAt, now }: { scanning: boolean; scannedAt: number | null; now: number }) {
  const text = scanning ? "Scanning..." : formatScannedAgo(scannedAt, now);
  return (
    <View style={styles.statusLine} accessibilityLiveRegion="polite">
      {scanning && <ActivityIndicator size="small" color={theme.accentEnd} />}
      <Text style={styles.statusText}>{text}</Text>
      {!scanning && <Text style={styles.statusHint}>Pull down to scan again</Text>}
    </View>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  return (
    <View style={styles.search}>
      <Ionicons name="search-outline" size={SEARCH_ICON_SIZE} color={theme.textTertiary} />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChange}
        placeholder="Search by name, address or brand"
        placeholderTextColor={theme.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        accessibilityLabel="Search devices"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background, paddingHorizontal: theme.spacing.xl },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: theme.textPrimary, fontSize: theme.type.title, fontWeight: "700", flexShrink: 1 },
  list: { paddingBottom: theme.spacing.xxl },
  listHeader: { gap: theme.spacing.sm, marginBottom: theme.spacing.xs },
  rowGap: { marginBottom: theme.spacing.sm },
  statusLine: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, minHeight: theme.spacing.xl },
  statusText: { color: theme.textSecondary, fontSize: theme.type.label },
  statusHint: { color: theme.textTertiary, fontSize: theme.type.label },
  search: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, minHeight: MIN_TARGET, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.borderSubtle },
  searchInput: { flex: 1, color: theme.textPrimary, fontSize: theme.type.body, minHeight: MIN_TARGET },
});
