import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CapabilityId } from "../core/types/Capability";
import { theme } from "./theme";
import { useTouchpadGesture } from "./useTouchpadGesture";

interface TouchpadModalProps {
  visible: boolean;
  onSend: (capability: CapabilityId, args?: Record<string, unknown>) => void;
  onClose: () => void;
}

/**
 * A full-screen drag-to-move, tap-to-click touchpad (ADR-HEARTH-215) -- drives a TV's real mouse
 * pointer (LgWebOsDriver.ts's pointerMove/pointerClick) rather than the d-pad's discrete focus
 * navigation, for content (like Family Command Center's own dashboard, shown in the LG's built-in
 * browser) that expects a real cursor, not a TV app's remote-friendly focus order.
 */
export function TouchpadModal({ visible, onSend, onClose }: TouchpadModalProps) {
  const gesture = useTouchpadGesture(
    (dx, dy) => onSend("pointerMove", { dx, dy }),
    () => onSend("pointerClick")
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Touchpad</Text>
          <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close touchpad">
            <Ionicons name="close" size={28} color={theme.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.pad} {...gesture}>
          <Text style={styles.hint}>Drag to move • Tap to click</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xxl,
    paddingBottom: theme.spacing.md,
  },
  title: { color: theme.textPrimary, fontSize: theme.type.title, fontWeight: "700" },
  closeButton: { padding: theme.spacing.sm },
  pad: {
    flex: 1,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xxl,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { color: theme.textTertiary, fontSize: theme.type.body, fontWeight: "600" },
});
