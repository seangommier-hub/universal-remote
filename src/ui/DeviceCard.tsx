import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { DeviceConnectionStatus } from "./DeviceConnectionStatus";
import { theme } from "./theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

const CATEGORY_ICON: Record<string, IconName> = {
  tv: "tv-outline",
  streaming: "play-circle-outline",
  lighting: "bulb-outline",
  gaming: "game-controller-outline",
  audio: "musical-notes-outline",
  vacuum: "hardware-chip-outline",
};

const FALLBACK_ICON: IconName = "hardware-chip-outline";

/** The icon for a device's category. */
export function iconForDevice(device: Device): IconName {
  return CATEGORY_ICON[device.category] ?? FALLBACK_ICON;
}

interface DeviceCardProps {
  device: Device;
  stateStore: StateStore;
  favorite: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

/** One row of the Devices list: icon, name, make and model, live status; long-press opens the device's actions. */
export function DeviceCard({ device, stateStore, favorite, onPress, onLongPress }: DeviceCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={device.name}
      accessibilityHint="Double tap to open. Long press for more options."
    >
      <View style={styles.icon}>
        <Ionicons name={iconForDevice(device)} size={22} color={theme.accentEnd} />
      </View>
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {device.name}
          </Text>
          {favorite && <Ionicons name="star" size={13} color={theme.accentStart} />}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {device.manufacturer} {device.model}
        </Text>
        <DeviceConnectionStatus stateStore={stateStore} deviceId={device.id} />
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  pressed: { opacity: 0.6 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  // minWidth: 0 keeps a long name truncating instead of pushing the chevron (ADR-HEARTH-053 class of bug).
  body: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  name: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "600", flexShrink: 1 },
  meta: { color: theme.textSecondary, fontSize: theme.type.label, marginTop: theme.spacing.xs },
});
