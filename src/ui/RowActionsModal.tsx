import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text } from "react-native";
import { DiscoveryRow } from "../discovery/discoveryRows";
import { theme } from "./theme";

const MIN_TARGET = 44;
const ICON_SIZE = 20;
const BACKDROP_COLOR = "#00000099";

interface RowActionsModalProps {
  /** The device the menu is for; null hides it. */
  row: DiscoveryRow | null;
  onHide: (row: DiscoveryRow) => void;
  onShowAgain: (row: DiscoveryRow) => void;
  onChooseBrand: (row: DiscoveryRow) => void;
  onClose: () => void;
}

interface ActionProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

function Action({ icon, label, onPress }: ActionProps) {
  return (
    <Pressable style={({ pressed }) => [styles.action, pressed && styles.pressed]} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={ICON_SIZE} color={theme.textSecondary} />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

/** Secondary actions for one discovered device, kept out of the row so each row has a single obvious button. */
export function RowActionsModal({ row, onHide, onShowAgain, onChooseBrand, onClose }: RowActionsModalProps) {
  return (
    <Modal visible={row !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu" accessibilityRole="button">
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.title} numberOfLines={1}>
            {row?.title}
          </Text>
          {row && <Action icon="albums-outline" label="It's a ... (choose the brand)" onPress={() => onChooseBrand(row)} />}
          {row && !row.hidden && <Action icon="eye-off-outline" label="Not a remote device — hide" onPress={() => onHide(row)} />}
          {row && row.hidden && <Action icon="eye-outline" label="Show in the list again" onPress={() => onShowAgain(row)} />}
          <Pressable style={styles.cancel} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: BACKDROP_COLOR, alignItems: "center", justifyContent: "flex-end", padding: theme.spacing.lg },
  card: { width: "100%", maxWidth: 420, backgroundColor: theme.surfaceRaised, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: theme.spacing.xs },
  title: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700", paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.sm },
  action: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, minHeight: MIN_TARGET, paddingHorizontal: theme.spacing.sm, borderRadius: theme.radius.sm },
  pressed: { backgroundColor: theme.surface },
  actionLabel: { color: theme.textPrimary, fontSize: theme.type.body },
  cancel: { minHeight: MIN_TARGET, alignItems: "center", justifyContent: "center", borderTopWidth: 1, borderTopColor: theme.border, marginTop: theme.spacing.xs },
  cancelLabel: { color: theme.textSecondary, fontSize: theme.type.body, fontWeight: "600" },
});
