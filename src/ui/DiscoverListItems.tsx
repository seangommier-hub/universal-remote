import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ListItem } from "../discovery/discoverySections";
import { theme } from "./theme";

const MIN_TARGET = 44;
const CHEVRON_SIZE = 18;

/** A section title with its count, e.g. "Ready to add (3)". */
export function SectionHeader({ title, count, minor }: { title: string; count: number; minor?: boolean }) {
  return (
    <Text style={minor ? styles.subheader : styles.header} accessibilityRole="header">
      {title} ({count})
    </Text>
  );
}

/** The single row that expands or collapses the "other devices" list or the hidden list. */
export function ToggleRow({ item, onPress }: { item: Extract<ListItem, { type: "toggle" }>; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityState={{ expanded: item.expanded }}
    >
      <Text style={styles.toggleLabel}>{item.label}</Text>
      <Ionicons name={item.expanded ? "chevron-up" : "chevron-down"} size={CHEVRON_SIZE} color={theme.textSecondary} />
    </Pressable>
  );
}

/** Shown when a search matches nothing. */
export function NoMatchNotice() {
  return (
    <View style={styles.noMatch}>
      <Text style={styles.noMatchText}>No devices match that search.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700", marginTop: theme.spacing.xl, marginBottom: theme.spacing.sm },
  subheader: { color: theme.textSecondary, fontSize: theme.type.label, fontWeight: "600", letterSpacing: 0.4, marginTop: theme.spacing.md, marginBottom: theme.spacing.xs },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: MIN_TARGET,
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  pressed: { backgroundColor: theme.surface },
  toggleLabel: { color: theme.textPrimary, fontSize: theme.type.body },
  noMatch: { paddingVertical: theme.spacing.xl, alignItems: "center" },
  noMatchText: { color: theme.textSecondary, fontSize: theme.type.label },
});
