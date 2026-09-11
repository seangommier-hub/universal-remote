import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Device } from "../core/types/Device";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

export type AddableBrand = "sony" | "samsung" | "lg" | "roku" | "hue";

type IconName = ComponentProps<typeof Ionicons>["name"];

const ADD_DEVICE_OPTIONS: { brand: AddableBrand; label: string; icon: IconName }[] = [
  { brand: "sony", label: "Sony TV", icon: "tv-outline" },
  { brand: "samsung", label: "Samsung TV", icon: "tv-outline" },
  { brand: "lg", label: "LG TV", icon: "tv-outline" },
  { brand: "roku", label: "Roku", icon: "play-circle-outline" },
  { brand: "hue", label: "Philips Hue", icon: "bulb-outline" },
];

const CATEGORY_ICON: Record<string, IconName> = {
  tv: "tv-outline",
  streaming: "play-circle-outline",
  lighting: "bulb-outline",
};

interface DeviceListScreenProps {
  devices: Device[];
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
}

/** Household device list. Has no idea what a "Samsung" or "LG" is beyond which pairing form to open next — it just renders whatever devices are registered. */
export function DeviceListScreen({
  devices,
  onSelect,
  onAddDevice,
  onDiscover,
  onConnectFamilyCommandCenter,
  onOpenCommandCenterRemote,
  onRemove,
  onEditAddress,
}: DeviceListScreenProps) {
  // See DiscoverDevicesScreen.tsx's identical comment — a hardcoded paddingTop guessed for an
  // iPhone notch never accounted for Android's own, differently-sized status bar.
  const insets = useSafeAreaInsets();

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
          <Text style={styles.title}>Hearth</Text>
          <Text style={styles.subtitle}>One home. One remote.</Text>
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
                <Text style={styles.deviceName}>{item.name}</Text>
                <Text style={styles.deviceMeta}>
                  {item.manufacturer} {item.model}
                </Text>
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
            <Text style={styles.addTileLabel}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background, paddingHorizontal: theme.spacing.xl },
  header: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginBottom: theme.spacing.xl },
  headerText: { flex: 1 },
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
  addTileLabel: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "600" },
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
  cardBody: { flex: 1 },
  deviceName: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "600" },
  deviceMeta: { color: theme.textSecondary, fontSize: theme.type.label, marginTop: theme.spacing.xs },
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
});
