import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommandEngine } from "../core/engine/CommandEngine";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { Activity, ActivityRun } from "../core/types/Activity";
import { ActivityHistoryList } from "./ActivityHistoryList";
import type { ActivityProgress } from "./useActivities";
import { useConnectivityMode } from "./useConnectivityMode";
import { ConnectivityBadge } from "./ConnectivityBadge";
import { DeviceActionsModal } from "./DeviceActionsModal";
import { DefaultActivitiesOfferCard } from "./DefaultActivitiesOfferCard";
import { DeviceListSections } from "./DeviceListSections";
import { GroupBySwitch } from "./GroupBySwitch";
import { roomChoices } from "../core/layout/deviceLayout";
import { actionModalStyles as modal } from "./actionModalStyles";
import { useDefaultActivitiesOffer } from "./useDefaultActivitiesOffer";
import { useDeviceLayout } from "./useDeviceLayout";
import { addPickerBrands, BrandId } from "../discovery/brandRegistry";
import { HOME_ASSISTANT_DRIVER_ID } from "../drivers/homeAssistant/HomeAssistantDriver";
import { BrandOptionList } from "./BrandOptionList";
import { CapabilityButton } from "./CapabilityButton";
import { FirstRunSetupCard } from "./FirstRunSetupCard";
import { NowPlayingWidget } from "./NowPlayingWidget";
import { NowSummaryList } from "./NowSummaryList";
import { NowViewMode, NowViewSwitch } from "./NowViewSwitch";
import { SuggestedDevicesSection } from "./SuggestedDevicesSection";
import { theme } from "./theme";
import { useNameSuggestion } from "./useNameSuggestion";
import { useNowSummary } from "./useNowSummary";
import { OfflineAlertBanner } from "./OfflineAlertBanner";
import { TokenUpgradeBanner } from "./TokenUpgradeBanner";
import { UpdateBanner } from "./UpdateBanner";
import { useNowPlaying } from "./useNowPlaying";

const ADD_PICKER_SEARCH_AFTER = 6;

interface DeviceListScreenProps {
  devices: Device[];
  /** Real gap found in review (2026-09-10), during a live "why is it not connecting" troubleshooting session: this screen never showed connection status at all — every device looked identical whether connected, disconnected, or mid-reconnect, so there was no way to tell at a glance whether something needed attention without tapping in and waiting out the full reconnect timeout. Each row now subscribes to its own live state. */
  stateStore: StateStore;
  /** Needed to connect a "Suggested from your network" row on tap (ADR-HEARTH-092/148). */
  driverRegistry: DriverRegistry;
  /** Drives the now-playing widget's back/playPause/home buttons (ADR-HEARTH-093). */
  commandEngine: CommandEngine;
  onSelect: (device: Device) => void;
  onAddDevice: (brand: BrandId) => void;
  /** ADR-HEARTH-148: opens a brand's own multi-step add screen with the discovered address prefilled (Hue, PS5, Apple TV). */
  onOpenBrandScreen: (brand: BrandId, ipAddress: string, serviceUrl?: string | null) => void;
  /** A quick-add from the inline "Suggested from your network" section (ADR-HEARTH-092) — routed through the same handler as every other add path (App.tsx's handleDeviceAdded), so duplicate prevention and persistence work identically regardless of which screen the add started from. */
  onQuickAdd: (device: Device) => void;
  onDiscover: () => void;
  /** Opens Family Command Center pairing (first-time) or its settings (already configured) — also where a "requires Family Command Center" row sends the user. */
  onConnectFamilyCommandCenter: () => void;
  /** Whether Family Command Center is already configured — see `onConnectFamilyCommandCenter`'s own comment for why this changes the header button's destination, icon, and label. */
  fccConfigured: boolean;
  /** Opens the invite-code join screen (ADR-HEARTH-149), offered on the first-run empty state. */
  onJoinWithCode: () => void;
  /** Opens the phone-as-trackpad-and-keyboard screen for the Family Command Center itself (ADR-HEARTH-033) — a different thing from pairing/discovering *devices*, so its own header button rather than folding into onConnectFamilyCommandCenter. */
  onOpenCommandCenterRemote: () => void;
  /** Manually triggers an EAS Update check (ADR-HEARTH-084/086) — Sean's "a true update button" ask, rather than only ever waiting for the silent automatic check on launch/foreground. */
  onCheckForUpdates: () => void;
  /** Opens the Assist text-box screen (ADR-HEARTH-183) for the given Home Assistant instance; the header button that calls this only ever shows once at least one Home Assistant device is on the list. */
  onOpenHomeAssistantAssist: (instanceId: string) => void;
  updateBanner: { status: "checking" | "downloaded" | "error" | "up-to-date" } | null;
  onApplyUpdate: () => void;
  onDismissUpdateBanner: () => void;
  /** Unpairs a device (disconnects it, removes it from the registry and from persisted storage) — triggered by a long-press, confirmed first since it's not reversible from this screen. */
  onRemove: (device: Device) => void;
  /** Retries connecting a device now; used by the offline banner's Retry (ADR-HEARTH-172). */
  onReconnect: (device: Device) => Promise<void>;
  /** Opens a small form to correct a device's saved IP address without a full remove-and-re-add — real-hardware need (2026-09-10): a device's IP can go stale (moved to a different WiFi network) and the fastest fix shouldn't be "unpair everything and start over." Offered from the same long-press menu as Remove. */
  onEditAddress: (device: Device) => void;
  /** Opens a small form to rename a device — the action already existed (tap a device's own name inside its remote screen), but that's not discoverable from here, so it's offered from the same long-press menu as Edit address/Remove (ADR-HEARTH-085). */
  onRename: (device: Device) => void;
  /** Opens the "teach a button" flow for a Broadlink IR/RF hub device (see TeachBroadlinkCommandScreen.tsx) — offered from the same long-press menu, but only for that one driver, since every other device's capabilities come from a fixed protocol rather than something taught after the fact. */
  onTeachCommands: (device: Device) => void;
  /** Opens the wake checklist and guided wake test for an existing device (ADR-HEARTH-154). */
  onSetupChecks: (device: Device) => void;
  /** ADR-HEARTH-156: applies the name the device itself reports. */
  onUseDeviceName: (device: Device, name: string) => void;
  /** Activities (ADR-HEARTH-150, formerly Scenes/ADR-HEARTH-056): household multi-step macros — a horizontal row of chips
   * kept deliberately compact (not a full section/grid) so it doesn't compete with the device list
   * for vertical space on the home screen, the same "one screen" pressure every other layout
   * decision here has had to account for. */
  activities: Activity[];
  /** The step currently running, so its chip can show "2/5" while it works. */
  activityProgress: ActivityProgress | null;
  /** Most recent household runs from the Pi, newest first. */
  activityHistory: ActivityRun[];
  onRunActivity: (activity: Activity) => void;
  onCreateActivity: () => void;
  onEditActivity: (activity: Activity) => void;
  onRemoveActivity: (activity: Activity) => void;
  /** Generates a unique base id for a new Activity (ADR-HEARTH-200: the default-activities offer needs two ids at once, so it derives both from one call rather than reusing this for a single activity). */
  newActivityId: () => string;
  /** Saves the two auto-generated Activities (ADR-HEARTH-200) through the same path as any hand-built one. */
  onGenerateDefaultActivities: (allOn: Activity, allOff: Activity) => void;
}

/** Household device list. Has no idea what a "Samsung" or "LG" is beyond which pairing form to open next — it just renders whatever devices are registered. */
export function DeviceListScreen({
  devices,
  stateStore,
  driverRegistry,
  commandEngine,
  onSelect,
  onAddDevice,
  onOpenBrandScreen,
  onQuickAdd,
  onDiscover,
  onConnectFamilyCommandCenter,
  fccConfigured,
  onJoinWithCode,
  onOpenCommandCenterRemote,
  onCheckForUpdates,
  onOpenHomeAssistantAssist,
  updateBanner,
  onApplyUpdate,
  onDismissUpdateBanner,
  onRemove,
  onReconnect,
  onEditAddress,
  onRename,
  onTeachCommands,
  onSetupChecks,
  onUseDeviceName,
  activities,
  activityProgress,
  activityHistory,
  onRunActivity,
  onCreateActivity,
  onEditActivity,
  onRemoveActivity,
  newActivityId,
  onGenerateDefaultActivities,
}: DeviceListScreenProps) {
  // See DiscoverDevicesScreen.tsx's identical comment — a hardcoded paddingTop guessed for an
  // iPhone notch never accounted for Android's own, differently-sized status bar.
  const insets = useSafeAreaInsets();
  const connectivityMode = useConnectivityMode();
  // ADR-HEARTH-183: the header's "Ask Home Assistant" button only shows once a Home Assistant
  // device is on the list, and opens Assist for whichever instance the first one belongs to (the
  // overwhelming common case is one household server; a second instance is reachable by adding its
  // own device first).
  const homeAssistantInstanceId = devices.find((device) => device.driverId === HOME_ASSISTANT_DRIVER_ID)?.config?.instanceId as string | undefined;
  // Android's Alert.alert silently drops any button past the 3rd (the same bug already found and
  // fixed in DiscoverDevicesScreen.tsx's brand picker, 2026-09-12) — with Cancel + Rename + Edit
  // address + Remove this is 4, so a custom modal replaces Alert.alert here for the same reason.
  const [actionsTarget, setActionsTarget] = useState<Device | null>(null);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [viewMode, setViewMode] = useState<NowViewMode>("all");
  const nowPlaying = useNowPlaying(devices, stateStore);
  const nameSuggestion = useNameSuggestion(actionsTarget, stateStore);
  const layout = useDeviceLayout(devices);
  // ADR-HEARTH-194: a filtered, re-sorted read of the same grouped-list model below -- only the
  // devices currently on, each with a one-tap Off button.
  const nowRows = useNowSummary(layout.model, stateStore);
  const defaultActivitiesOffer = useDefaultActivitiesOffer(devices, activities, newActivityId);

  function showActivityActions(activity: Activity) {
    Alert.alert(activity.name, undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Edit", onPress: () => onEditActivity(activity) },
      { text: "Delete", style: "destructive", onPress: () => onRemoveActivity(activity) },
    ]);
  }

  function handleRemovePress(device: Device) {
    Alert.alert("Remove device?", `${device.name} will be unpaired from Hearth. You can add it again later.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => onRemove(device) },
    ]);
  }
  return (
    <View style={[styles.container, { paddingTop: insets.top + theme.spacing.lg }]}>
      <View style={styles.header}>
        <View style={styles.brandMark}>
          <View style={styles.emberDot} />
        </View>
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            {/* ADR-HEARTH-180: at large Dynamic Type sizes the fixed-size ConnectivityBadge and
                header icon buttons beside this title take up a growing share of the row's width,
                and a plain numberOfLines={1} truncation there degraded "Hearth" into an unreadable
                "H..." — found via the ui-verify harness's ?fontScale= approximation (1.6x). Same
                shrink-to-fit technique this codebase already uses for the streaming tiles/input
                grid (StreamingAppTile, CapabilityButton's numberOfLines path) instead of a hard clip. */}
            <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
              Hearth
            </Text>
            <ConnectivityBadge mode={connectivityMode} />
          </View>
          {/* Same shrink-to-fit fix as the title above (ADR-HEARTH-180): a plain numberOfLines={1}
              truncated this to "One home. One ..." once the header row's icons and badge left it
              little width, found live 2026-09-28. */}
          <Text style={styles.subtitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {connectivityMode === "away" ? "Remote — away from home" : "One home. One remote."}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.fccButton, pressed && styles.cardPressed]}
          onPress={onOpenCommandCenterRemote}
          accessibilityRole="button"
          accessibilityLabel="Command Center trackpad and keyboard"
        >
          <Ionicons name="hardware-chip-outline" size={20} color={theme.accentEnd} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.fccButton, pressed && styles.cardPressed]}
          onPress={onConnectFamilyCommandCenter}
          accessibilityRole="button"
          accessibilityLabel={fccConfigured ? "Family Command Center settings" : "Connect Family Command Center"}
        >
          <Ionicons name={fccConfigured ? "settings-outline" : "link-outline"} size={20} color={theme.accentEnd} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.fccButton, pressed && styles.cardPressed]}
          onPress={onCheckForUpdates}
          accessibilityRole="button"
          accessibilityLabel="Check for updates"
        >
          <Ionicons name="cloud-download-outline" size={20} color={theme.accentEnd} />
        </Pressable>
        {homeAssistantInstanceId && (
          <Pressable
            style={({ pressed }) => [styles.fccButton, pressed && styles.cardPressed]}
            onPress={() => onOpenHomeAssistantAssist(homeAssistantInstanceId)}
            accessibilityRole="button"
            accessibilityLabel="Ask Home Assistant"
          >
            <Ionicons name="chatbox-ellipses-outline" size={20} color={theme.accentEnd} />
          </Pressable>
        )}
      </View>

      {/* Real gap fixed 2026-09-19 (ADR-HEARTH-092): with three stacked sections below (Connected
          Devices, Suggested From Your Network, Add a Device) now able to exceed one screen's
          height, everything needs to scroll together — the device FlatList above had
          scrollEnabled disabled for exactly this reason (nesting a scrolling VirtualizedList
          inside a ScrollView is a real, documented RN bug class, not just a style choice). */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <OfflineAlertBanner devices={devices} stateStore={stateStore} driverRegistry={driverRegistry} commandEngine={commandEngine} fccConfigured={fccConfigured} onReconnect={onReconnect} />
      <TokenUpgradeBanner fccConfigured={fccConfigured} onJoinWithCode={onJoinWithCode} />
      {updateBanner && <UpdateBanner status={updateBanner.status} onApply={onApplyUpdate} onDismiss={onDismissUpdateBanner} />}

      {/* Real bug found live (2026-09-12): a horizontal FlatList's data-item cells rendered at a
          wildly oversized, distorted height (a ~300px-tall oval instead of a compact chip) while
          its ListHeaderComponent rendered correctly at the same declared style — a New-Architecture
          Fabric cell-wrapping quirk for horizontal lists, not anything wrong with sceneChip's own
          style. Scenes will only ever number in the single digits to dozens, so FlatList's
          virtualization was unneeded complexity anyway — replaced with a plain horizontal
          ScrollView + .map(), the same pattern this screen's own "add device" grid already uses,
          which sidesteps the bug entirely and renders every chip identically. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sceneRow}>
        <Pressable
          style={({ pressed }) => [styles.sceneChip, styles.newSceneChip, pressed && styles.cardPressed]}
          onPress={onCreateActivity}
          accessibilityRole="button"
          accessibilityLabel="New activity"
        >
          <Ionicons name="add" size={16} color={theme.accentEnd} />
          <Text style={styles.newSceneLabel}>New Activity</Text>
        </Pressable>
        {activities.map((activity) => {
          const running = activityProgress?.activityId === activity.id ? activityProgress : null;
          return (
            <Pressable
              key={activity.id}
              style={({ pressed }) => [styles.sceneChip, pressed && styles.cardPressed]}
              onPress={() => onRunActivity(activity)}
              onLongPress={() => showActivityActions(activity)}
              accessibilityRole="button"
              accessibilityLabel={`Run ${activity.name}`}
              accessibilityHint={running ? "Double tap to stop this run." : "Double tap to run. Long press for more options."}
            >
              <Ionicons name="flash" size={14} color={theme.accentEnd} />
              <Text style={styles.sceneLabel} numberOfLines={1}>
                {running ? `${activity.name} ${running.index + 1}/${running.total}` : activity.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <ActivityHistoryList runs={activityHistory} />

      {defaultActivitiesOffer.visible && (
        <DefaultActivitiesOfferCard
          onCreate={() => {
            const { allOn, allOff } = defaultActivitiesOffer.generate();
            onGenerateDefaultActivities(allOn, allOff);
          }}
          onDismiss={defaultActivitiesOffer.dismiss}
        />
      )}

      {/* ADR-HEARTH-093: one at a time, per Sean's own explicit scoping — not a widget per
          playing device. Absent entirely when nothing is playing/paused anywhere. */}
      {nowPlaying && (
        <NowPlayingWidget
          device={nowPlaying.device}
          title={nowPlaying.title}
          stateStore={stateStore}
          commandEngine={commandEngine}
          onOpen={() => onSelect(nowPlaying.device)}
        />
      )}

      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>{viewMode === "now" ? "Now" : "Connected Devices"}</Text>
        <View style={styles.sectionControls}>
          {devices.length > 0 && <NowViewSwitch value={viewMode} onChange={setViewMode} />}
          {viewMode === "all" && devices.length > 0 && <GroupBySwitch value={layout.layout.groupBy} onChange={layout.changeGroupBy} />}
        </View>
      </View>
      {devices.length === 0 ? (
        <FirstRunSetupCard serverSaved={fccConfigured} onJoinWithCode={onJoinWithCode} onScanQr={onConnectFamilyCommandCenter} />
      ) : viewMode === "now" ? (
        <NowSummaryList rows={nowRows} commandEngine={commandEngine} onSelect={onSelect} />
      ) : (
        <DeviceListSections
          model={layout.model}
          stateStore={stateStore}
          onSelect={onSelect}
          onLongPress={setActionsTarget}
          onToggleSection={layout.toggleSection}
        />
      )}

      <SuggestedDevicesSection
        driverRegistry={driverRegistry}
        stateStore={stateStore}
        devices={devices}
        onAdded={onQuickAdd}
        onOpenBrandScreen={onOpenBrandScreen}
        onOpenFccSetup={onConnectFamilyCommandCenter}
        onSeeAll={onDiscover}
      />

      <Pressable
        style={({ pressed }) => [styles.addButton, pressed && styles.cardPressed]}
        onPress={() => setShowAddPicker(true)}
        accessibilityRole="button"
        accessibilityLabel="Add a device"
      >
        <Ionicons name="add-circle-outline" size={20} color={theme.background} />
        <Text style={styles.addButtonLabel}>Add a Device</Text>
      </Pressable>

      <Pressable onPress={onDiscover} accessibilityRole="button" accessibilityLabel="Scan your network for more devices" hitSlop={4}>
        <Text style={styles.scanLinkLabel}>Scan your network for more (optional)</Text>
      </Pressable>
      </ScrollView>

      <Modal visible={showAddPicker} transparent animationType="fade" onRequestClose={() => setShowAddPicker(false)}>
        {/* accessible={false} on both wrapping Pressables (ADR-HEARTH-180): a Pressable defaults
            to accessible=true, which would otherwise collapse the brand list and Cancel link below
            into one unlabeled VoiceOver/TalkBack node instead of each being individually reachable. */}
        <Pressable style={modal.backdrop} onPress={() => setShowAddPicker(false)} accessible={false}>
          <Pressable style={modal.card} onPress={(e) => e.stopPropagation()} accessible={false}>
            <Text style={modal.title}>Add a device</Text>
            <BrandOptionList
              brands={addPickerBrands()}
              searchAfter={ADD_PICKER_SEARCH_AFTER}
              accessibilityLabelFor={(brand) => `Add ${brand.label}`}
              onPick={(brand) => {
                setShowAddPicker(false);
                onAddDevice(brand.id);
              }}
            />
            <Pressable style={modal.cancel} onPress={() => setShowAddPicker(false)}>
              <Text style={modal.cancelLabel}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <DeviceActionsModal
        device={actionsTarget}
        nameSuggestion={nameSuggestion}
        isFavorite={actionsTarget ? layout.layout.favorites.includes(actionsTarget.id) : false}
        isKidAllowed={actionsTarget ? layout.layout.kidAllowed.includes(actionsTarget.id) : false}
        isGuestAllowed={actionsTarget ? layout.layout.guestAllowed.includes(actionsTarget.id) : false}
        currentRoom={actionsTarget ? layout.layout.rooms[actionsTarget.id] : undefined}
        roomChoices={roomChoices(layout.layout)}
        canMoveUp={actionsTarget ? layout.canMove(actionsTarget, "up") : false}
        canMoveDown={actionsTarget ? layout.canMove(actionsTarget, "down") : false}
        handlers={{
          onRename,
          onUseDeviceName,
          onEditAddress,
          onSetupChecks,
          onTeachCommands,
          onRemove: handleRemovePress,
          onToggleFavorite: layout.toggleFavoriteFor,
          onToggleKidAllowed: layout.toggleKidAllowedFor,
          onToggleGuestAllowed: layout.toggleGuestAllowedFor,
          onSetRoom: layout.setRoom,
          onMove: layout.move,
        }}
        onClose={() => setActionsTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background, paddingHorizontal: theme.spacing.xl },
  scrollContent: { paddingBottom: theme.spacing.xxl },
  header: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginBottom: theme.spacing.xl },
  // minWidth: 0 overrides Yoga's default min-content floor for a flex:1 item — without it, the
  // title/subtitle's own text width can force this box wider than the space actually left by
  // brandMark + both fccButtons, pushing/overlapping those icons instead of wrapping (the
  // "settings gear overlapping other items" report, 2026-09-12).
  headerText: { flex: 1, minWidth: 0 },
  // flexWrap (visual sweep, 2026-10-06): with 3 fixed 44px header icon buttons + the 44px brandMark,
  // headerText's own width drops to ~121px at a 393pt viewport (393 - 48 outer padding - 4*44 fixed
  // squares - 4*12 header gaps). Without wrap, flexbox's default shrink-the-flexible-sibling-first
  // behavior (title has flexShrink:1, ConnectivityBadge has flexShrink:0) squeezed "Hearth" itself
  // down to an unreadable "H..." before the badge gave up any width -- adjustsFontSizeToFit (the
  // intended rescue, ADR-HEARTH-208) is iOS-only and never fires on web/Android. Wrapping lets the
  // badge drop to its own line under the title instead, the same pattern sectionLabelRow below
  // already uses for its own large-text-size overflow.
  titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: theme.spacing.sm },
  fccButton: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emberDot: {
    width: 16,
    height: 16,
    borderRadius: theme.radius.full,
    backgroundColor: theme.accentEnd,
  },
  // flexShrink (ADR-HEARTH-208): adjustsFontSizeToFit is iOS-only, so on Android a long title pushed the
  // fixed-width Home/Away badge past headerText into the first header icon. The title gives way instead.
  title: { color: theme.textPrimary, fontSize: theme.type.display, fontWeight: "700", flexShrink: 1 },
  subtitle: { color: theme.textSecondary, fontSize: theme.type.body },
  // flexWrap: at large text sizes the switch drops under the label instead of squeezing it to "CONN...".
  sectionLabelRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: theme.spacing.sm, rowGap: theme.spacing.xs, marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm },
  // ADR-HEARTH-194: holds the Now/All switch plus (in All mode) the existing Group-by switch, wrapping onto its own line at large text sizes the same way sectionLabelRow's own children already do.
  sectionControls: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: theme.spacing.sm },
  sectionLabel: {
    color: theme.textSecondary,
    fontSize: theme.type.label,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // ADR-HEARTH-092: a single solid-filled button (unlike the old outlined discoverTile) — this
  // is now the primary, always-available action on the screen, not a secondary one-time setup
  // step, so it earns the stronger visual weight ADR-HEARTH-016 originally reserved for it.
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.accentEnd,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  addButtonLabel: { color: theme.background, fontSize: theme.type.body, fontWeight: "700" },
  scanLinkLabel: {
    color: theme.textSecondary,
    fontSize: theme.type.label,
    textAlign: "center",
    marginTop: theme.spacing.md,
  },
  cardPressed: { opacity: 0.6 },
  emptyState: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xxl,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    marginBottom: theme.spacing.lg,
  },
  emptyTitle: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "600" },
  emptyBody: {
    color: theme.textSecondary,
    fontSize: theme.type.label,
    textAlign: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  sceneRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingBottom: theme.spacing.lg },
  sceneChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    maxWidth: 160,
  },
  sceneLabel: { color: theme.textPrimary, fontSize: theme.type.label, fontWeight: "600" },
  newSceneChip: { borderColor: theme.accentEnd, borderStyle: "dashed" },
  newSceneLabel: { color: theme.accentEnd, fontSize: theme.type.label, fontWeight: "600" },
});
