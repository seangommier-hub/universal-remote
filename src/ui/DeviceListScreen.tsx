import { Ionicons } from "@expo/vector-icons";
import { ComponentProps, useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommandEngine } from "../core/engine/CommandEngine";
import { DiscoveredDevice } from "../core/discovery/DiscoveryProvider";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { Scene } from "../core/types/Scene";
import { BROADLINK_IR_DRIVER_ID } from "../drivers/irHub/broadlink/BroadlinkIrDriver";
import { FamilyCommandCenterDiscoveryProvider } from "../discovery/FamilyCommandCenterDiscoveryProvider";
import { SsdpDiscoveryProvider } from "../discovery/SsdpDiscoveryProvider";
import { scanAllProviders } from "../discovery/scanAllProviders";
import { CapabilityButton } from "./CapabilityButton";
import { NowPlayingWidget } from "./NowPlayingWidget";
import { theme } from "./theme";
import { UpdateBanner } from "./UpdateBanner";
import { useNowPlaying } from "./useNowPlaying";

export type AddableBrand = "sony" | "samsung" | "lg" | "roku" | "hue" | "smartthings" | "yamaha" | "xbox" | "kasa" | "sonos" | "ps5" | "denon" | "chromecast" | "broadlink";

type IconName = ComponentProps<typeof Ionicons>["name"];

const ADD_DEVICE_OPTIONS: { brand: AddableBrand; label: string; icon: IconName }[] = [
  { brand: "sony", label: "Sony TV", icon: "tv-outline" },
  { brand: "samsung", label: "Samsung TV", icon: "tv-outline" },
  { brand: "lg", label: "LG TV", icon: "tv-outline" },
  { brand: "roku", label: "Roku", icon: "play-circle-outline" },
  { brand: "yamaha", label: "Yamaha Receiver", icon: "musical-notes-outline" },
  { brand: "hue", label: "Philips Hue", icon: "bulb-outline" },
  { brand: "smartthings", label: "Sync from SmartThings", icon: "flash-outline" },
  { brand: "xbox", label: "Xbox", icon: "game-controller-outline" },
  { brand: "kasa", label: "TP-Link Kasa Plug", icon: "flash-outline" },
  { brand: "sonos", label: "Sonos Speaker", icon: "musical-notes-outline" },
  { brand: "ps5", label: "PS5", icon: "game-controller-outline" },
  { brand: "denon", label: "Denon / Marantz", icon: "musical-notes-outline" },
  { brand: "chromecast", label: "Chromecast", icon: "tv-outline" },
  { brand: "broadlink", label: "IR/RF Hub (Broadlink)", icon: "radio-outline" },
];

const CATEGORY_ICON: Record<string, IconName> = {
  tv: "tv-outline",
  streaming: "play-circle-outline",
  lighting: "bulb-outline",
  gaming: "game-controller-outline",
  audio: "musical-notes-outline",
};

// Mirrors DiscoverDevicesScreen.tsx's identical list — the brands with a real "manufacturer +
// IP, no other credential" manual-add shape (Hue needs a separate bridge-IP device, SmartThings
// is cloud-linked with no IP-based add, neither fits this "pick a brand for this one IP" flow;
// PS5 is excluded too — its own credential comes from the PlayStation-App capture dance, not from
// an IP alone, so pre-filling just the IP from a discovered-but-unrecognized row wouldn't help).
// Broadlink fits cleanly — IP only, no pairing step at all (see AddBroadlinkHubScreen.tsx).
const MANUAL_ADD_BRANDS: { brand: AddableBrand; label: string }[] = [
  { brand: "sony", label: "Sony TV" },
  { brand: "samsung", label: "Samsung TV" },
  { brand: "lg", label: "LG TV" },
  { brand: "roku", label: "Roku" },
  { brand: "yamaha", label: "Yamaha Receiver" },
  { brand: "xbox", label: "Xbox" },
  { brand: "sonos", label: "Sonos Speaker" },
  { brand: "denon", label: "Denon / Marantz" },
  { brand: "chromecast", label: "Chromecast" },
  { brand: "broadlink", label: "IR/RF Hub (Broadlink)" },
];

// ADR-HEARTH-094: which of the Family Command Center dashboard's own DEVICE_CATEGORIES
// (device-labels.ts on the Pi) are worth suggesting even when Hearth can't auto-recognize the
// brand. "computer"/"phone"/"other" are deliberately excluded — a household member explicitly
// labeled those as NOT smart-home devices, and showing them here would be exactly the clutter
// this whole feature exists to avoid.
const HOUSEHOLD_PLAUSIBLE_CATEGORIES = ["tv", "smart_speaker", "smart_device"];

interface DeviceListScreenProps {
  devices: Device[];
  /** Real gap found in review (2026-09-10), during a live "why is it not connecting" troubleshooting session: this screen never showed connection status at all — every device looked identical whether connected, disconnected, or mid-reconnect, so there was no way to tell at a glance whether something needed attention without tapping in and waiting out the full reconnect timeout. Each row now subscribes to its own live state. */
  stateStore: StateStore;
  /** Needed to actually connect a "Suggested from your network" tile on tap (ADR-HEARTH-092) — the same driver lookup DiscoverDevicesScreen already uses for its own Connect buttons. */
  driverRegistry: DriverRegistry;
  /** Drives the now-playing widget's back/playPause/home buttons (ADR-HEARTH-093). */
  commandEngine: CommandEngine;
  onSelect: (device: Device) => void;
  onAddDevice: (brand: AddableBrand) => void;
  /** ADR-HEARTH-094: opens a specific brand's manual-add form with its IP pre-filled — for a "Suggested" tile the household has labeled but Hearth can't auto-recognize the brand of, mirroring DiscoverDevicesScreen's identical onAddManually. */
  onAddDeviceWithIp: (brand: AddableBrand, ipAddress: string) => void;
  /** A quick-add from the inline "Suggested from your network" section (ADR-HEARTH-092) — routed through the same handler as every other add path (App.tsx's handleDeviceAdded), so duplicate prevention and persistence work identically regardless of which screen the add started from. */
  onQuickAdd: (device: Device) => void;
  onDiscover: () => void;
  /** Opens Family Command Center pairing directly from the home screen — previously only reachable by first triggering "Discover devices" and hitting its not-configured error state, three taps deep for what's meant to be a one-time setup step. */
  onConnectFamilyCommandCenter: () => void;
  /** Opens the phone-as-trackpad-and-keyboard screen for the Family Command Center itself (ADR-HEARTH-033) — a different thing from pairing/discovering *devices*, so its own header button rather than folding into onConnectFamilyCommandCenter. */
  onOpenCommandCenterRemote: () => void;
  /** Manually triggers an EAS Update check (ADR-HEARTH-084/086) — Sean's "a true update button" ask, rather than only ever waiting for the silent automatic check on launch/foreground. */
  onCheckForUpdates: () => void;
  updateBanner: { status: "checking" | "downloaded" | "error" | "up-to-date" } | null;
  onApplyUpdate: () => void;
  onDismissUpdateBanner: () => void;
  /** Unpairs a device (disconnects it, removes it from the registry and from persisted storage) — triggered by a long-press, confirmed first since it's not reversible from this screen. */
  onRemove: (device: Device) => void;
  /** Opens a small form to correct a device's saved IP address without a full remove-and-re-add — real-hardware need (2026-09-10): a device's IP can go stale (moved to a different WiFi network) and the fastest fix shouldn't be "unpair everything and start over." Offered from the same long-press menu as Remove. */
  onEditAddress: (device: Device) => void;
  /** Opens a small form to rename a device — the action already existed (tap a device's own name inside its remote screen), but that's not discoverable from here, so it's offered from the same long-press menu as Edit address/Remove (ADR-HEARTH-085). */
  onRename: (device: Device) => void;
  /** Opens the "teach a button" flow for a Broadlink IR/RF hub device (see TeachBroadlinkCommandScreen.tsx) — offered from the same long-press menu, but only for that one driver, since every other device's capabilities come from a fixed protocol rather than something taught after the fact. */
  onTeachCommands: (device: Device) => void;
  /** Scenes: manually-triggered multi-device macros (ADR-HEARTH-056) — a horizontal row of chips
   * kept deliberately compact (not a full section/grid) so it doesn't compete with the device list
   * for vertical space on the home screen, the same "one screen" pressure every other layout
   * decision here has had to account for. */
  scenes: Scene[];
  onRunScene: (scene: Scene) => void;
  onCreateScene: () => void;
  onEditScene: (scene: Scene) => void;
  onRemoveScene: (scene: Scene) => void;
}

/** A small live indicator so a device's connection state is visible at a glance from the list, without tapping in and waiting out the full reconnect timeout to find out. Subscribes independently per row so one device's state change doesn't re-render the whole list. */
function ConnectionStatus({ stateStore, deviceId }: { stateStore: StateStore; deviceId: string }) {
  const [connection, setConnection] = useState(() => stateStore.get(deviceId).connection);

  useEffect(() => {
    setConnection(stateStore.get(deviceId).connection);
    return stateStore.subscribe(deviceId, (state) => setConnection(state.connection));
  }, [stateStore, deviceId]);

  const color = connection === "connected" ? theme.statusOn : connection === "disconnected" ? theme.statusError : theme.statusOff;
  const label = connection === "connected" ? "Connected" : connection === "disconnected" ? "Disconnected" : "Unknown";

  return (
    <View style={styles.connectionRow}>
      <View style={[styles.connectionDot, { backgroundColor: color }]} />
      <Text style={styles.connectionLabel}>{label}</Text>
    </View>
  );
}

/** Household device list. Has no idea what a "Samsung" or "LG" is beyond which pairing form to open next — it just renders whatever devices are registered. */
export function DeviceListScreen({
  devices,
  stateStore,
  driverRegistry,
  commandEngine,
  onSelect,
  onAddDevice,
  onAddDeviceWithIp,
  onQuickAdd,
  onDiscover,
  onConnectFamilyCommandCenter,
  onOpenCommandCenterRemote,
  onCheckForUpdates,
  updateBanner,
  onApplyUpdate,
  onDismissUpdateBanner,
  onRemove,
  onEditAddress,
  onRename,
  onTeachCommands,
  scenes,
  onRunScene,
  onCreateScene,
  onEditScene,
  onRemoveScene,
}: DeviceListScreenProps) {
  // See DiscoverDevicesScreen.tsx's identical comment — a hardcoded paddingTop guessed for an
  // iPhone notch never accounted for Android's own, differently-sized status bar.
  const insets = useSafeAreaInsets();
  // Android's Alert.alert silently drops any button past the 3rd (the same bug already found and
  // fixed in DiscoverDevicesScreen.tsx's brand picker, 2026-09-12) — with Cancel + Rename + Edit
  // address + Remove this is 4, so a custom modal replaces Alert.alert here for the same reason.
  const [actionsTarget, setActionsTarget] = useState<Device | null>(null);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const nowPlaying = useNowPlaying(devices, stateStore);

  // "Suggested from your network" (ADR-HEARTH-092, expanded by ADR-HEARTH-094/095): runs BOTH
  // SSDP (native, zero-Pi-dependency — ADR-HEARTH-095, Sean: "the pi5 and command center are a
  // symbiotic supplement to Hearth," not something discovery should be gated behind) and Family
  // Command Center concurrently via scanAllProviders, merged. A household with neither configured
  // (no FCC set up, SSDP's multicast entitlement not yet granted on iOS) just sees no section at
  // all, never an error, since this is a bonus convenience, not a required step. Shown here: a
  // recognized brand (instant one-tap connect), OR an unrecognized device the household has
  // already labeled on the FCC dashboard as a plausible smart-home category
  // (HOUSEHOLD_PLAUSIBLE_CATEGORIES) — for those, "Add" opens the same brand-picker
  // ADR-HEARTH-062 already established, since there's no driver to instant-connect with. Anything
  // else (no recognized brand AND no plausible label) stays excluded — too uncertain to suggest
  // without becoming noise — but remains visible, honestly labeled, through the full Discover
  // screen's "Scan your network for more" link.
  const [suggested, setSuggested] = useState<DiscoveredDevice[]>([]);
  const [quickAddingId, setQuickAddingId] = useState<string | null>(null);
  const [quickAddError, setQuickAddError] = useState<{ id: string; message: string } | null>(null);
  const [manualAddTarget, setManualAddTarget] = useState<DiscoveredDevice | null>(null);

  const knownHwaddrs = devices.map((d) => (typeof d.config?.hwaddr === "string" ? d.config.hwaddr.toLowerCase() : null)).filter((h): h is string => h !== null);
  // Real bug found live (2026-09-19): every manual "Add Device" screen (AddLgDeviceScreen etc.)
  // stores only `{ ipAddress }` in config, never `hwaddr` — that field is only ever populated by
  // this screen's own handleQuickAdd below. A device paired through manual entry (the only path
  // that currently works for LG, which needs Family Command Center's relay to connect at all) can
  // never match the hwaddr-only check above, so it kept reappearing here as "suggested" forever
  // even after being successfully added. IP is a weaker identity than hwaddr (it can change), but
  // it's what every manual-add screen actually has, so it's a real fallback, not a guess.
  const knownIps = devices.map((d) => (typeof d.config?.ipAddress === "string" ? d.config.ipAddress : null)).filter((ip): ip is string => ip !== null);

  useEffect(() => {
    let cancelled = false;
    scanAllProviders([new SsdpDiscoveryProvider(), new FamilyCommandCenterDiscoveryProvider()]).then((found) => {
      if (cancelled) return;
      setSuggested(
        found.filter((d) => {
          const alreadyPaired = knownHwaddrs.includes(String(d.metadata?.hwaddr ?? "").toLowerCase());
          if (alreadyPaired) return false;
          const alreadyPairedByIp = knownIps.includes(String(d.metadata?.ipAddress ?? ""));
          if (alreadyPairedByIp) return false;
          const householdCategory = String(d.metadata?.householdCategory ?? "");
          return d.driverId.length > 0 || HOUSEHOLD_PLAUSIBLE_CATEGORIES.includes(householdCategory);
        })
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-scanning on every knownHwaddrs/
    // knownIps identity change (a new array every render) would re-fire this on every keystroke elsewhere
    // in the app; devices.length is a cheap enough proxy for "the paired list actually changed".
  }, [devices.length]);

  async function handleQuickAdd(discovered: DiscoveredDevice) {
    const driver = driverRegistry.get(discovered.driverId);
    if (!driver) return;
    const ipAddress = discovered.metadata?.ipAddress;
    const hwaddr = discovered.metadata?.hwaddr;
    const device: Device = {
      id: discovered.id,
      name: discovered.name,
      category: discovered.category,
      manufacturer: discovered.manufacturer,
      driverId: discovered.driverId,
      capabilities: driver.getCapabilities(),
      config: { ipAddress, hwaddr },
    };
    setQuickAddingId(discovered.id);
    setQuickAddError(null);
    try {
      await driver.connect(device);
      // Suggested name (ADR-HEARTH-085): prefer the device's own real, self-reported name over
      // the generic DHCP hostname when a driver fetched one at connect time.
      const suggestedName = stateStore.get(device.id).values.deviceName;
      const named: Device = typeof suggestedName === "string" && suggestedName.trim() ? { ...device, name: suggestedName.trim() } : device;
      setSuggested((current) => current.filter((d) => d.id !== discovered.id));
      onQuickAdd(named);
    } catch (err) {
      setQuickAddError({ id: discovered.id, message: err instanceof Error ? err.message : String(err) });
      driver.disconnect(device).catch(() => {});
    } finally {
      setQuickAddingId(null);
    }
  }

  function showSceneActions(scene: Scene) {
    Alert.alert(scene.name, undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Edit", onPress: () => onEditScene(scene) },
      { text: "Delete", style: "destructive", onPress: () => onRemoveScene(scene) },
    ]);
  }

  // ADR-HEARTH-094: mirrors DiscoverDevicesScreen.tsx's identical handlePickBrand — a labeled-but-
  // unrecognized suggestion has no driverId to instant-connect with, so "Add" routes here instead,
  // pre-filling the IP into whichever brand's own manual-add form the user picks.
  function handlePickBrand(brand: AddableBrand) {
    if (!manualAddTarget) return;
    const ipAddress = String(manualAddTarget.metadata?.ipAddress ?? "");
    setManualAddTarget(null);
    onAddDeviceWithIp(brand, ipAddress);
  }

  function handleRemovePress(device: Device) {
    setActionsTarget(null);
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
          <Text style={styles.title} numberOfLines={1}>
            Hearth
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            One home. One remote.
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
          accessibilityLabel="Connect Family Command Center"
        >
          <Ionicons name="link-outline" size={20} color={theme.accentEnd} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.fccButton, pressed && styles.cardPressed]}
          onPress={onCheckForUpdates}
          accessibilityRole="button"
          accessibilityLabel="Check for updates"
        >
          <Ionicons name="cloud-download-outline" size={20} color={theme.accentEnd} />
        </Pressable>
      </View>

      {/* Real gap fixed 2026-09-19 (ADR-HEARTH-092): with three stacked sections below (Connected
          Devices, Suggested From Your Network, Add a Device) now able to exceed one screen's
          height, everything needs to scroll together — the device FlatList above had
          scrollEnabled disabled for exactly this reason (nesting a scrolling VirtualizedList
          inside a ScrollView is a real, documented RN bug class, not just a style choice). */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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
          onPress={onCreateScene}
          accessibilityRole="button"
          accessibilityLabel="New scene"
        >
          <Ionicons name="add" size={16} color={theme.accentEnd} />
          <Text style={styles.newSceneLabel}>New Scene</Text>
        </Pressable>
        {scenes.map((scene) => (
          <Pressable
            key={scene.id}
            style={({ pressed }) => [styles.sceneChip, pressed && styles.cardPressed]}
            onPress={() => onRunScene(scene)}
            onLongPress={() => showSceneActions(scene)}
            accessibilityRole="button"
            accessibilityLabel={`Run ${scene.name}`}
            accessibilityHint="Double tap to run. Long press for more options."
          >
            <Ionicons name="flash" size={14} color={theme.accentEnd} />
            <Text style={styles.sceneLabel} numberOfLines={1}>
              {scene.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

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

      <Text style={styles.sectionLabel}>Connected Devices</Text>
      {devices.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="home-outline" size={40} color={theme.textTertiary} />
          <Text style={styles.emptyTitle}>No devices yet</Text>
          <Text style={styles.emptyBody}>Add your first TV or streaming device below to start controlling it.</Text>
        </View>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(device) => device.id}
          contentContainerStyle={styles.list}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => onSelect(item)}
              onLongPress={() => setActionsTarget(item)}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              accessibilityHint="Double tap to open. Long press for more options."
            >
              <View style={styles.cardIcon}>
                <Ionicons name={CATEGORY_ICON[item.category] ?? "hardware-chip-outline"} size={22} color={theme.accentEnd} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.deviceName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.deviceMeta} numberOfLines={1}>
                  {item.manufacturer} {item.model}
                </Text>
                <ConnectionStatus stateStore={stateStore} deviceId={item.id} />
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </Pressable>
          )}
        />
      )}

      {/* ADR-HEARTH-092: runs silently in the background — nothing renders here at all for a
          household that hasn't configured Family Command Center (ADR-HEARTH-089's opt-in choice),
          or once every found device is already paired. */}
      {suggested.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Suggested From Your Network</Text>
          <View style={styles.list}>
            {suggested.map((item) => {
              const isAdding = quickAddingId === item.id;
              const isRecognized = item.driverId.length > 0;
              return (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardIcon}>
                    <Ionicons name={CATEGORY_ICON[item.category] ?? "hardware-chip-outline"} size={22} color={theme.accentEnd} />
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.deviceName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.deviceMeta} numberOfLines={1}>
                      {item.manufacturer}
                    </Text>
                    {!isRecognized && (
                      <Text style={styles.quickAddHint} numberOfLines={1}>
                        Labeled on your network — pick a brand to add
                      </Text>
                    )}
                    {quickAddError?.id === item.id && (
                      <Text style={styles.quickAddError} numberOfLines={1}>
                        Couldn't connect: {quickAddError.message}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.quickAddButton, pressed && styles.cardPressed]}
                    onPress={() => (isRecognized ? handleQuickAdd(item) : setManualAddTarget(item))}
                    disabled={isAdding}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${item.name}`}
                  >
                    {isAdding ? <ActivityIndicator color={theme.background} size="small" /> : <Text style={styles.quickAddLabel}>Add</Text>}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </>
      )}

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
        <Pressable style={styles.modalBackdrop} onPress={() => setShowAddPicker(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Add a device</Text>
            {ADD_DEVICE_OPTIONS.map((option) => (
              <Pressable
                key={option.brand}
                style={({ pressed }) => [styles.modalOptionRow, pressed && styles.modalOptionPressed]}
                onPress={() => {
                  setShowAddPicker(false);
                  onAddDevice(option.brand);
                }}
              >
                <Ionicons name={option.icon} size={18} color={theme.accentEnd} />
                <Text style={styles.modalOptionLabel}>{option.label}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.modalCancel} onPress={() => setShowAddPicker(false)}>
              <Text style={styles.modalCancelLabel}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={manualAddTarget !== null} transparent animationType="fade" onRequestClose={() => setManualAddTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setManualAddTarget(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Add {manualAddTarget?.name}</Text>
            <Text style={styles.modalBody}>Pick the actual brand — the IP address shown for this device carries over.</Text>
            {MANUAL_ADD_BRANDS.map(({ brand, label }) => (
              <Pressable key={brand} style={({ pressed }) => [styles.modalOption, pressed && styles.modalOptionPressed]} onPress={() => handlePickBrand(brand)}>
                <Text style={styles.modalOptionLabel}>{label}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.modalCancel} onPress={() => setManualAddTarget(null)}>
              <Text style={styles.modalCancelLabel}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={actionsTarget !== null} transparent animationType="fade" onRequestClose={() => setActionsTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setActionsTarget(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{actionsTarget?.name}</Text>
            {actionsTarget && (
              <>
                <Pressable
                  style={({ pressed }) => [styles.modalOption, pressed && styles.modalOptionPressed]}
                  onPress={() => {
                    const device = actionsTarget;
                    setActionsTarget(null);
                    onRename(device);
                  }}
                >
                  <Text style={styles.modalOptionLabel}>Rename</Text>
                </Pressable>
                {typeof actionsTarget.config?.ipAddress === "string" && (
                  <Pressable
                    style={({ pressed }) => [styles.modalOption, pressed && styles.modalOptionPressed]}
                    onPress={() => {
                      const device = actionsTarget;
                      setActionsTarget(null);
                      onEditAddress(device);
                    }}
                  >
                    <Text style={styles.modalOptionLabel}>Edit address</Text>
                  </Pressable>
                )}
                {actionsTarget.driverId === BROADLINK_IR_DRIVER_ID && (
                  <Pressable
                    style={({ pressed }) => [styles.modalOption, pressed && styles.modalOptionPressed]}
                    onPress={() => {
                      const device = actionsTarget;
                      setActionsTarget(null);
                      onTeachCommands(device);
                    }}
                  >
                    <Text style={styles.modalOptionLabel}>Teach commands</Text>
                  </Pressable>
                )}
                <Pressable
                  style={({ pressed }) => [styles.modalOption, pressed && styles.modalOptionPressed]}
                  onPress={() => handleRemovePress(actionsTarget)}
                >
                  <Text style={styles.modalDestructiveLabel}>Remove</Text>
                </Pressable>
              </>
            )}
            <Pressable style={styles.modalCancel} onPress={() => setActionsTarget(null)}>
              <Text style={styles.modalCancelLabel}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  title: { color: theme.textPrimary, fontSize: theme.type.display, fontWeight: "700" },
  subtitle: { color: theme.textSecondary, fontSize: theme.type.body },
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
  quickAddButton: {
    backgroundColor: theme.accentEnd,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    minWidth: 64,
    alignItems: "center",
  },
  quickAddLabel: { color: theme.background, fontWeight: "600", fontSize: theme.type.label },
  quickAddError: { color: theme.statusError, fontSize: theme.type.caption, marginTop: theme.spacing.xs },
  quickAddHint: { color: theme.textTertiary, fontSize: theme.type.caption, marginTop: theme.spacing.xs, fontStyle: "italic" },
  modalBody: { color: theme.textSecondary, fontSize: theme.type.label, marginBottom: theme.spacing.sm },
  modalOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.sm,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardPressed: { opacity: 0.6 },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  // Real bug found by code review (2026-09-12), same class as ADR-HEARTH-053/046/049: flex:1 with
  // no minWidth:0 gets an implicit min-content floor under the New Architecture's Yoga, and
  // deviceName/deviceMeta had no numberOfLines either — a long device name (or manufacturer+model
  // string) could force this box wider than the space left by cardIcon + the chevron, overlapping
  // the chevron instead of truncating, the same symptom already fixed on every other header in
  // this app.
  cardBody: { flex: 1, minWidth: 0 },
  deviceName: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "600" },
  deviceMeta: { color: theme.textSecondary, fontSize: theme.type.label, marginTop: theme.spacing.xs },
  connectionRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  connectionDot: { width: 7, height: 7, borderRadius: theme.radius.full },
  connectionLabel: { color: theme.textTertiary, fontSize: theme.type.caption },
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
  modalBackdrop: { flex: 1, backgroundColor: "#00000099", alignItems: "center", justifyContent: "center", padding: theme.spacing.xl },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: theme.surfaceRaised,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  modalTitle: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700", marginBottom: theme.spacing.xs },
  modalOption: { paddingVertical: theme.spacing.md, borderRadius: theme.radius.sm },
  modalOptionPressed: { backgroundColor: theme.surface },
  modalOptionLabel: { color: theme.accentEnd, fontSize: theme.type.body, fontWeight: "600" },
  modalDestructiveLabel: { color: theme.statusError, fontSize: theme.type.body, fontWeight: "600" },
  modalCancel: { paddingVertical: theme.spacing.md, marginTop: theme.spacing.xs, borderTopWidth: 1, borderTopColor: theme.border },
  modalCancelLabel: { color: theme.textSecondary, fontSize: theme.type.body, fontWeight: "600", textAlign: "center" },
});
