import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CommandEngine } from "../core/engine/CommandEngine";
import { Device } from "../core/types/Device";
import { iconForDevice } from "./DeviceCard";
import { NowDeviceRow } from "./nowSummary";
import { theme } from "./theme";

const EMPTY_ICON_SIZE = 28;
const OFF_ICON_SIZE = 16;

interface NowSummaryListProps {
  rows: NowDeviceRow[];
  commandEngine: CommandEngine;
  onSelect: (device: Device) => void;
}

/**
 * The Now view's rows (ADR-HEARTH-194): each shows the device's icon, name and live one-line
 * status, plus a one-tap Off button; a calm empty state when nothing in the household is on right
 * now. A failed Off command is swallowed the same fire-and-forget way NowPlayingWidget's own
 * transport buttons already are -- CommandEngine itself logs the failure, and this is a summary
 * view, not a place to surface a new error UI.
 */
export function NowSummaryList({ rows, commandEngine, onSelect }: NowSummaryListProps) {
  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="moon-outline" size={EMPTY_ICON_SIZE} color={theme.textTertiary} />
        <Text style={styles.emptyText}>Nothing is on right now</Text>
      </View>
    );
  }

  function turnOff(row: NowDeviceRow): void {
    commandEngine.execute({ deviceId: row.device.id, capability: row.offCapability }).catch(() => {});
  }

  return (
    <View style={styles.list}>
      {rows.map((row) => (
        <View key={row.device.id} style={styles.card}>
          {/* Sibling Pressables, not one nested in the other (same reasoning as NowPlayingWidget's
              own openArea/controls split): a Pressable defaults to accessible=true, which would
              otherwise collapse the Off button into the same opaque VoiceOver/TalkBack node as the
              row's own open action. */}
          <Pressable
            style={styles.openArea}
            onPress={() => onSelect(row.device)}
            accessibilityRole="button"
            accessibilityLabel={`${row.device.name}, ${row.status}`}
            accessibilityHint="Double tap to open."
          >
            <View style={styles.icon}>
              <Ionicons name={iconForDevice(row.device)} size={22} color={theme.accentEnd} />
            </View>
            <View style={styles.body}>
              <Text style={styles.name} numberOfLines={1}>
                {row.device.name}
              </Text>
              <Text style={styles.status} numberOfLines={1}>
                {row.status}
              </Text>
            </View>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.offButton, pressed && styles.pressed]}
            onPress={() => turnOff(row)}
            accessibilityRole="button"
            accessibilityLabel={`Turn off ${row.device.name}`}
          >
            <Ionicons name="power" size={OFF_ICON_SIZE} color={theme.background} />
            <Text style={styles.offLabel}>Off</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.md, paddingBottom: theme.spacing.md },
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
  openArea: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  icon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  // minWidth: 0 keeps a long name/status truncating instead of pushing the Off button off-card.
  body: { flex: 1, minWidth: 0 },
  name: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "600" },
  status: { color: theme.statusOn, fontSize: theme.type.label, marginTop: theme.spacing.xs },
  offButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    backgroundColor: theme.accentEnd,
    borderRadius: theme.radius.full,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  offLabel: { color: theme.background, fontSize: theme.type.label, fontWeight: "700" },
  empty: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xxl,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    marginBottom: theme.spacing.lg,
  },
  emptyText: { color: theme.textSecondary, fontSize: theme.type.body, textAlign: "center" },
});
