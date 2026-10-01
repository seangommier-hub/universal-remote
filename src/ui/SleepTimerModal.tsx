import { Modal, Pressable, StyleSheet, Text } from "react-native";
import { formatSleepRemaining } from "./formatSleepRemaining";
import { theme } from "./theme";

const SLEEP_TIMER_DURATIONS_MINUTES = [15, 30, 45, 60]; // matches the presets Samsung's own native sleepTimer cycles through — familiar even for devices using the universal fallback

interface SleepTimerModalProps {
  visible: boolean;
  /** The active universal sleep timer's expiry, or undefined when none is running — picked up from sleepTimerManager.ts by the caller. */
  sleepExpiresAt: number | undefined;
  onClose: () => void;
  onCancel: () => void;
  onStart: (minutes: number) => void;
}

/** The universal sleep timer's duration picker / cancel modal, opened from the remote screen's utility row. */
export function SleepTimerModal({ visible, sleepExpiresAt, onClose, onCancel, onStart }: SleepTimerModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* accessible={false} on both wrapping Pressables (ADR-HEARTH-180): a Pressable defaults
          to accessible=true, which collapses every descendant into ONE opaque VoiceOver/
          TalkBack node — without this, the sleep-duration options and Close link below would
          never be individually reachable. */}
      <Pressable style={styles.modalBackdrop} onPress={onClose} accessible={false}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()} accessible={false}>
          {sleepExpiresAt !== undefined ? (
            <>
              <Text style={styles.modalTitle}>Sleep Timer</Text>
              <Pressable style={({ pressed }) => [styles.modalOption, pressed && styles.modalOptionPressed]} onPress={onCancel}>
                <Text style={styles.modalOptionLabel}>Cancel sleep ({formatSleepRemaining(sleepExpiresAt)} left)</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.modalTitle}>Sleep after…</Text>
              {SLEEP_TIMER_DURATIONS_MINUTES.map((minutes) => (
                <Pressable key={minutes} style={({ pressed }) => [styles.modalOption, pressed && styles.modalOptionPressed]} onPress={() => onStart(minutes)}>
                  <Text style={styles.modalOptionLabel}>{minutes} minutes</Text>
                </Pressable>
              ))}
            </>
          )}
          <Pressable style={styles.modalCancel} onPress={onClose}>
            <Text style={styles.modalCancelLabel}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Same modal styling pattern as DeviceListScreen.tsx's own picker modals — reused here for the
// universal sleep timer's duration picker so it reads as the same kind of control, not a
// one-off design.
const styles = StyleSheet.create({
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
  modalOptionPressed: { backgroundColor: theme.surfaceRaised },
  modalOptionLabel: { color: theme.accentEnd, fontSize: theme.type.body, fontWeight: "600" },
  modalCancel: { paddingVertical: theme.spacing.md, marginTop: theme.spacing.xs, borderTopWidth: 1, borderTopColor: theme.border },
  modalCancelLabel: { color: theme.textSecondary, fontSize: theme.type.body, fontWeight: "600", textAlign: "center" },
});
