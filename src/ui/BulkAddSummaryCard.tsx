import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Device } from "../core/types/Device";
import { BatchWakeRowResult, canBatchWakeTest } from "./batchWakeTest";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";
import { BulkFollowupState } from "./useBulkFollowup";

const ICON_SIZE = 20;
const MIN_TARGET = 44;

interface BulkAddSummaryCardProps {
  state: BulkFollowupState;
  onStartEdit: (device: Device) => void;
  onDraftChange: (text: string) => void;
  onCommitEdit: () => void;
  onTestAll: () => void;
  /** "Skip, I'll do this later" — always available, whether or not a wake test has run. */
  onSkip: () => void;
}

function devicesHeadline(count: number): string {
  return count === 1 ? "1 device added" : `${count} devices added`;
}

const STATUS_ICON: Record<Exclude<BatchWakeRowResult["status"], "waiting" | "testing">, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  pass: { name: "checkmark-circle", color: theme.statusOn },
  fail: { name: "close-circle", color: theme.statusError },
  skip: { name: "information-circle-outline", color: theme.textTertiary },
};

function ResultIcon({ result }: { result: BatchWakeRowResult | undefined }) {
  if (!result || result.status === "waiting") return null;
  if (result.status === "testing") return <ActivityIndicator size="small" color={theme.accentEnd} />;
  const icon = STATUS_ICON[result.status];
  return <Ionicons name={icon.name} size={ICON_SIZE} color={icon.color} />;
}

function DeviceNameField({ device, editing, draft, onStartEdit, onDraftChange, onCommitEdit }: { device: Device; editing: boolean; draft: string; onStartEdit: () => void; onDraftChange: (text: string) => void; onCommitEdit: () => void }) {
  if (editing) {
    return (
      <TextInput
        style={styles.nameInput}
        value={draft}
        onChangeText={onDraftChange}
        onSubmitEditing={onCommitEdit}
        onBlur={onCommitEdit}
        autoFocus
        autoCapitalize="words"
        returnKeyType="done"
        accessibilityLabel={`Rename ${device.name}`}
      />
    );
  }
  return (
    <Pressable onPress={onStartEdit} accessibilityRole="button" accessibilityLabel={`Rename ${device.name}`} style={styles.nameButton}>
      <Text style={styles.rowTitle} numberOfLines={1}>{device.name}</Text>
      <Ionicons name="pencil-outline" size={14} color={theme.textTertiary} />
    </Pressable>
  );
}

/**
 * Shown once "Add all ready" finishes (ADR-HEARTH-195): the added devices with their auto-detected
 * names editable in place, and one combined wake test across the whole batch instead of sending
 * every device through its own post-add screen (ADR-HEARTH-167's known gap).
 */
export function BulkAddSummaryCard({ state, onStartEdit, onDraftChange, onCommitEdit, onTestAll, onSkip }: BulkAddSummaryCardProps) {
  const testableCount = state.devices.filter(canBatchWakeTest).length;
  const canTestAll = testableCount > 0 && !state.testing;

  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <Text style={styles.title}>{devicesHeadline(state.devices.length)}</Text>
      <Text style={styles.hint}>Tap a name to fix it, or test that they all turn on from off.</Text>
      {state.devices.map((device) => (
        <View key={device.id} style={styles.row}>
          <View style={styles.flex}>
            <DeviceNameField
              device={device}
              editing={state.editingId === device.id}
              draft={state.draft}
              onStartEdit={() => onStartEdit(device)}
              onDraftChange={onDraftChange}
              onCommitEdit={onCommitEdit}
            />
            {state.results[device.id]?.message && <Text style={styles.resultMessage}>{state.results[device.id]?.message}</Text>}
          </View>
          <ResultIcon result={state.results[device.id]} />
        </View>
      ))}
      <View style={styles.buttonRow}>
        {testableCount > 0 && <CapabilityButton label={state.testing ? "Testing..." : "Test wake for all"} variant="accent" onPress={onTestAll} disabled={!canTestAll} />}
        <CapabilityButton label="Skip, I'll do this later" variant="ghost" onPress={onSkip} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.spacing.sm, backgroundColor: theme.surface, borderRadius: theme.radius.lg, padding: theme.spacing.lg, borderWidth: 1, borderColor: theme.accentSoft },
  title: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700" },
  hint: { color: theme.textSecondary, fontSize: theme.type.label },
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, minHeight: MIN_TARGET },
  flex: { flex: 1, minWidth: 0 },
  nameButton: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, minHeight: MIN_TARGET },
  rowTitle: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "600", flexShrink: 1 },
  nameInput: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "600", minHeight: MIN_TARGET, borderBottomWidth: 1, borderBottomColor: theme.accentEnd },
  resultMessage: { color: theme.textSecondary, fontSize: theme.type.label },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md, justifyContent: "center", marginTop: theme.spacing.sm },
});
