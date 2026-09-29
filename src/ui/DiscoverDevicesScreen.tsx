import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommandEngine } from "../core/engine/CommandEngine";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { logger } from "../core/logging/logger";
import { planAddAll, StepItem } from "../discovery/addAllPlan";
import { BrandEntry, BrandId } from "../discovery/brandRegistry";
import { DiscoveryRow } from "../discovery/discoveryRows";
import { buildListItems, buildSections, formatScannedAgo, ListItem, pickScreenState, shouldShowSearch } from "../discovery/discoverySections";
import { scanningText } from "../discovery/scanProgress";
import { buildSupportRequest, SUPPORT_REQUEST_SUBJECT } from "../discovery/unsupportedReport";
import { AddAllCard } from "./AddAllCard";
import { BrandPickerModal } from "./BrandPickerModal";
import { CapabilityButton } from "./CapabilityButton";
import { DiscoverEmptyState } from "./DiscoverEmptyState";
import { NoMatchNotice, SectionHeader, ToggleRow } from "./DiscoverListItems";
import { DiscoveredDeviceRow } from "./DiscoveredDeviceRow";
import { NetworkFailureNotice } from "./NetworkFailureNotice";
import { RowActionsModal } from "./RowActionsModal";
import { theme } from "./theme";
import { useAddAll } from "./useAddAll";
import { useAddDiscoveredDevice } from "./useAddDiscoveredDevice";
import { useBulkFollowup } from "./useBulkFollowup";
import { useDeviceLabels } from "./useDeviceLabels";
import { scanNetworkQuietly, useNetworkDevices } from "./useNetworkDevices";

interface DiscoverDevicesScreenProps {
  driverRegistry: DriverRegistry;
  stateStore: StateStore;
  commandEngine: CommandEngine;
  /** Devices already added, so they are left out of the list instead of offered twice. */
  devices: Device[];
  onCancel: () => void;
  onAdded: (device: Device) => void;
  /** Registers a device added by "Add all ready" without leaving this screen. */
  onAddedQuietly: (device: Device) => void;
  /** Applies a rename from the post-"Add all" summary card (ADR-HEARTH-195). */
  onRenameDevice: (device: Device, newName: string) => Promise<Device>;
  /** Opens the QR scanner (a household invite or a Family Command Center code). */
  onScanQr: () => void;
  /** Opens Family Command Center pairing/settings — for brands that need it and for widening coverage. */
  onOpenSettings: () => void;
  /** Opens a brand's own multi-step add screen with the address prefilled (Hue, PS5, Apple TV). */
  onOpenBrandScreen: (brand: BrandId, ipAddress: string, serviceUrl?: string | null) => void;
}

const CLOCK_TICK_MS = 1000;
const LOG_SCOPE = "discover";
const MIN_TARGET = 44;
const SEARCH_ICON_SIZE = 18;

/**
 * Every device on the network, calmly (ADR-HEARTH-148, ADR-HEARTH-153): "Ready to add" first,
 * recognized-but-off next, everything unrecognized collapsed behind one row and grouped by kind,
 * anything the person hid under "Hidden". One primary button per row, the rest in an overflow menu.
 */
export function DiscoverDevicesScreen({ driverRegistry, stateStore, commandEngine, devices, onCancel, onAdded, onAddedQuietly, onRenameDevice, onScanQr, onOpenSettings, onOpenBrandScreen }: DiscoverDevicesScreenProps) {
  const insets = useSafeAreaInsets();
  const network = useNetworkDevices();
  const { labels, setHidden, setBrand, markSupportRequested } = useDeviceLabels();
  const add = useAddDiscoveredDevice({ driverRegistry, stateStore, onAdded, onOpenBrandScreen, onIdentified: network.replaceDevice, rescan: scanNetworkQuietly });
  const followup = useBulkFollowup({ commandEngine, stateStore, onRenameDevice });
  const addAll = useAddAll({
    driverRegistry,
    stateStore,
    onAddedQuietly,
    onDone: (summary) => {
      if (summary.added.length > 0) followup.present(summary.added);
    },
  });
  const finishFollowup = () => {
    followup.close();
    addAll.dismiss();
  };
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
  const plan = useMemo(() => (searching ? { auto: [], steps: [] } : planAddAll(sections.ready, network.fccConfigured === true)), [searching, sections.ready, network.fccConfigured]);
  const scanText = scanningText({ foundCount: network.devices.length, elapsedMs: network.scanStartedAt === null ? 0 : now - network.scanStartedAt });

  const requestSupport = (row: DiscoveryRow) => {
    Share.share({ title: SUPPORT_REQUEST_SUBJECT, message: buildSupportRequest(row) })
      .then((result) => {
        if (result.action !== Share.dismissedAction) markSupportRequested(row.device);
      })
      .catch((error) => logger.warn(LOG_SCOPE, "Could not open the share sheet for a support request", { message: String(error) }));
  };
  const openPhoneSettings = () => {
    Linking.openSettings().catch((error) => logger.warn(LOG_SCOPE, "Could not open the phone's Settings", { message: String(error) }));
  };
  const startStep = (item: StepItem) => add.press(item.row);

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
        <DiscoveredDeviceRow row={item.row} ui={add.uiFor(item.row.device.id)} onPrimary={add.press} onSubmitFields={add.submitFields} onOpenFccSetup={onOpenSettings} onMore={setActionsRow} onRequestSupport={requestSupport} />
      </View>
    );
  };

  const listHeader = (
    <View style={styles.listHeader}>
      <ScanStatusLine scanning={isScanning} scanningText={scanText} scannedAt={network.scannedAt} now={now} onRescan={() => void network.rescan()} />
      {plan.auto.length + plan.steps.length + (addAll.state.phase === "idle" ? 0 : 1) > 0 && (
        <AddAllCard
          plan={plan}
          run={addAll.state}
          followup={followup.state}
          onAddAll={() => void addAll.start(plan.auto)}
          onDismissRun={addAll.dismiss}
          onStartStep={startStep}
          onStartEdit={followup.startEditing}
          onDraftChange={followup.changeDraft}
          onCommitEdit={() => void followup.commitEditing()}
          onTestAll={() => void followup.testAll()}
          onFinishFollowup={finishFollowup}
        />
      )}
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
        <DiscoverEmptyState kind={screenState} failure={network.failure} scanningText={scanText} onRetry={() => void network.rescan()} onOpenSettings={onOpenSettings} onOpenPhoneSettings={openPhoneSettings} />
      )}

      <Pressable style={styles.qrLink} onPress={onScanQr} accessibilityRole="button" accessibilityLabel="Scan an invite or setup QR code">
        <Ionicons name="qr-code-outline" size={SEARCH_ICON_SIZE} color={theme.accentEnd} />
        <Text style={styles.qrLinkLabel}>Have a QR code or invite? Scan it</Text>
      </Pressable>

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

interface ScanStatusLineProps {
  scanning: boolean;
  scanningText: string;
  scannedAt: number | null;
  now: number;
  onRescan: () => void;
}

function ScanStatusLine({ scanning, scanningText: liveText, scannedAt, now, onRescan }: ScanStatusLineProps) {
  const text = scanning ? liveText : formatScannedAgo(scannedAt, now);
  return (
    <View style={styles.statusLine} accessibilityLiveRegion="polite">
      {scanning && <ActivityIndicator size="small" color={theme.accentEnd} />}
      <Text style={styles.statusText} numberOfLines={1}>{text}</Text>
      {!scanning && (
        <Pressable style={styles.rescan} onPress={onRescan} accessibilityRole="button" accessibilityLabel="Scan again" hitSlop={8}>
          <Ionicons name="refresh" size={SEARCH_ICON_SIZE} color={theme.accentEnd} />
          <Text style={styles.rescanLabel}>Scan again</Text>
        </Pressable>
      )}
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
  statusText: { flexShrink: 1, color: theme.textSecondary, fontSize: theme.type.label },
  rescan: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, minHeight: MIN_TARGET, paddingLeft: theme.spacing.md },
  rescanLabel: { color: theme.accentEnd, fontSize: theme.type.label, fontWeight: "700" },
  qrLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.spacing.sm, minHeight: MIN_TARGET, marginBottom: theme.spacing.sm },
  qrLinkLabel: { color: theme.accentEnd, fontSize: theme.type.label, fontWeight: "600" },
  search: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, minHeight: MIN_TARGET, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.borderSubtle },
  searchInput: { flex: 1, color: theme.textPrimary, fontSize: theme.type.body, minHeight: MIN_TARGET },
});
