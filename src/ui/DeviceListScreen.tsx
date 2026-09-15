import { Ionicons } from "@expo/vector-icons";
import { ComponentProps, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { Scene } from "../core/types/Scene";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

export type AddableBrand = "sony" | "samsung" | "lg" | "roku" | "hue" | "smartthings" | "yamaha" | "xbox" | "kasa";

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
];

const CATEGORY_ICON: Record<string, IconName> = {
  tv: "tv-outline",
  streaming: "play-circle-outline",
  lighting: "bulb-outline",
  gaming: "game-controller-outline",
};

interface DeviceListScreenProps {
  devices: Device[];
  /** Real gap found in review (2026-09-10), during a live "why is it not connecting" troubleshooting session: this screen never showed connection status at all — every device looked identical whether connected, disconnected, or mid-reconnect, so there was no way to tell at a glance whether something needed attention without tapping in and waiting out the full reconnect timeout. Each row now subscribes to its own live state. */
  stateStore: StateStore;
  onSelect: (device: Device) => void;
  onAddDevice: (brand: AddableBrand) => void;
  onDiscover: () => void;
  /** Opens Family Command Center pairing directly from the home screen — previously only reachable by first triggering "Discover devices" and hitting its not-configured error state, three taps deep for what's meant to be a one-time setup step. */
  onConnectFamilyCommandCenter: () => void;
  /** Opens the phone-as-trackpad-and-keyboard screen for the Family Command Center itself (ADR-HEARTH-033) — a different thing from pairing/discovering *devices*, so its own header button rather than folding into onConnectFamilyCommandCenter. */
  onOpenCommandCenterRemote: () => void;
  /** Unpairs a device (disconnects it, removes it from the registry and from persisted storage) — triggered by a long-press, confirmed first since it's not reversible from this screen. */
  onRemove: (device: Device) => void;
  /** Opens a small form to correct a device's saved IP address without a full remove-and-re-add — real-hardware need (2026-09-10): a device's IP can go stale (moved to a different WiFi network) and the fastest fix shouldn't be "unpair everything and start over." Offered from the same long-press menu as Remove. */
  onEditAddress: (device: Device) => void;
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
  onSelect,
  onAddDevice,
  onDiscover,
  onConnectFamilyCommandCenter,
  onOpenCommandCenterRemote,
  onRemove,
  onEditAddress,
  scenes,
  onRunScene,
  onCreateScene,
  onEditScene,
  onRemoveScene,
}: DeviceListScreenProps) {
  // See DiscoverDevicesScreen.tsx's identical comment — a hardcoded paddingTop guessed for an
  // iPhone notch never accounted for Android's own, differently-sized status bar.
  const insets = useSafeAreaInsets();

  function showSceneActions(scene: Scene) {
    Alert.alert(scene.name, undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Edit", onPress: () => onEditScene(scene) },
      { text: "Delete", style: "destructive", onPress: () => onRemoveScene(scene) },
    ]);
  }

  function showDeviceActions(device: Device) {
    const hasAddress = typeof device.config?.ipAddress === "string";
    Alert.alert(device.name, undefined, [
      { text: "Cancel", style: "cancel" },
      ...(hasAddress ? [{ text: "Edit address", onPress: () => onEditAddress(device) }] : []),
      {
        text: "Remove",
        style: "destructive" as const,
        onPress: () =>
          Alert.alert("Remove device?", `${device.name} will be unpaired from Hearth. You can add it again later.`, [
            { text: "Cancel", style: "cancel" },
            { text: "Remove", style: "destructive", onPress: () => onRemove(device) },
          ]),
      },
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
      </View>

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
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => onSelect(item)}
              onLongPress={() => showDeviceActions(item)}
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

      <Pressable
        style={({ pressed }) => [styles.discoverTile, pressed && styles.cardPressed]}
        onPress={onDiscover}
        accessibilityRole="button"
        accessibilityLabel="Discover devices on your network"
      >
        <Ionicons name="search-outline" size={20} color={theme.accentEnd} />
        <Text style={styles.discoverLabel}>Discover devices on your network</Text>
      </Pressable>

      <Text style={styles.sectionLabel}>Or add a device manually</Text>
      <View style={styles.addGrid}>
        {ADD_DEVICE_OPTIONS.map((option) => (
          <Pressable
            key={option.brand}
            style={({ pressed }) => [styles.addTile, pressed && styles.cardPressed]}
            onPress={() => onAddDevice(option.brand)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${option.label}`}
          >
            <Ionicons name={option.icon} size={20} color={theme.accentEnd} />
            <Text style={styles.addTileLabel} numberOfLines={2}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background, paddingHorizontal: theme.spacing.xl },
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
  // Outlined rather than solid-filled (ADR-HEARTH-016): a one-time setup action shouldn't
  // visually outweigh the actual device cards above it, which is what a solid accent fill did.
  discoverTile: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.accentEnd,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  discoverLabel: { color: theme.accentEnd, fontSize: theme.type.body, fontWeight: "700" },
  addGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  addTile: {
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  // flex: 1 + minWidth: 0 — real overflow found by exact-dimension arithmetic (2026-09-12,
  // matching this file's own "348px... 53px too wide" convention from UniversalTvRemote.tsx):
  // at a 375pt baseline, addGrid's two-column tiles are ~159.5px wide (327px container width,
  // minus one spacing.sm gap, split evenly), leaving ~107.5px for the label after the icon,
  // its gap, and the tile's own horizontal padding. Without flex, React Native's default
  // flexShrink: 0 on a plain <Text> row-sibling means it keeps its full single-line
  // intrinsic width instead of wrapping to fit — "Sync from SmartThings" (21 characters,
  // ~168px unwrapped) is the one label in ADD_DEVICE_OPTIONS long enough to hit this; every
  // sibling ("Sony TV" through "Philips Hue") already fit in ~107.5px unwrapped and never
  // exposed the bug. minWidth: 0 prevents flex: 1 from reintroducing the same min-content
  // floor ADR-HEARTH-046 already documented for headerText.
  addTileLabel: { flex: 1, minWidth: 0, color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "600" },
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
});
