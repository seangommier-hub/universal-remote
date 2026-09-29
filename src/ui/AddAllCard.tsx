import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Device } from "../core/types/Device";
import { AddAllPlan, StepItem, stepsHeadline } from "../discovery/addAllPlan";
import { describeAddAllSummary, RowRunStatus } from "../discovery/addAllRunner";
import { BulkAddSummaryCard } from "./BulkAddSummaryCard";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";
import { AddAllState } from "./useAddAll";
import { BulkFollowupState } from "./useBulkFollowup";

const ICON_SIZE = 20;
const MIN_TARGET = 44;

interface AddAllCardProps {
  plan: AddAllPlan;
  run: AddAllState;
  /** The post-"Add all" summary (name edit + batch wake test); empty devices means nothing to follow up on (ADR-HEARTH-195). */
  followup: BulkFollowupState;
  onAddAll: () => void;
  /** Dismisses a finished run that added nothing to follow up on (every row failed or needed a step). */
  onDismissRun: () => void;
  onStartStep: (item: StepItem) => void;
  onStartEdit: (device: Device) => void;
  onDraftChange: (text: string) => void;
  onCommitEdit: () => void;
  onTestAll: () => void;
  /** "Skip, I'll do this later" on the summary card — dismisses the run and closes the summary together. */
  onFinishFollowup: () => void;
}

const STATUS_ICON: Record<Exclude<RowRunStatus, "adding">, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  waiting: { name: "ellipse-outline", color: theme.textTertiary },
  added: { name: "checkmark-circle", color: theme.statusOn },
  failed: { name: "close-circle", color: theme.statusError },
  "needs-step": { name: "hand-left-outline", color: theme.accentEnd },
};

function StatusIcon({ status }: { status: RowRunStatus }) {
  if (status === "adding") return <ActivityIndicator size="small" color={theme.accentEnd} />;
  const icon = STATUS_ICON[status];
  return <Ionicons name={icon.name} size={ICON_SIZE} color={icon.color} />;
}

interface RunProgressProps {
  run: AddAllState;
  queuedSteps: number;
  followup: BulkFollowupState;
  onDismiss: () => void;
  onStartEdit: (device: Device) => void;
  onDraftChange: (text: string) => void;
  onCommitEdit: () => void;
  onTestAll: () => void;
  onFinishFollowup: () => void;
}

function RunProgress({ run, queuedSteps, followup, onDismiss, onStartEdit, onDraftChange, onCommitEdit, onTestAll, onFinishFollowup }: RunProgressProps) {
  const showSummaryCard = run.phase === "done" && followup.devices.length > 0;
  return (
    <View style={styles.stack}>
      <View style={styles.card} accessibilityLiveRegion="polite">
        <Text style={styles.title}>{run.phase === "running" ? "Adding your devices..." : run.summary ? describeAddAllSummary(run.summary, queuedSteps) : ""}</Text>
        {run.rows.map((row) => {
          const result = run.results[row.device.id] ?? { status: "waiting" as const };
          return (
            <View key={row.device.id} style={styles.progressRow}>
              <StatusIcon status={result.status} />
              <View style={styles.flex}>
                <Text style={styles.rowTitle} numberOfLines={1}>{row.title}</Text>
                {result.status === "failed" || result.status === "needs-step" ? <Text style={styles.failure}>{result.message}</Text> : null}
              </View>
            </View>
          );
        })}
        {run.phase === "done" && !showSummaryCard && <CapabilityButton label="Done" variant="accent" onPress={onDismiss} />}
      </View>
      {showSummaryCard && (
        <BulkAddSummaryCard
          state={followup}
          onStartEdit={onStartEdit}
          onDraftChange={onDraftChange}
          onCommitEdit={onCommitEdit}
          onTestAll={onTestAll}
          onSkip={onFinishFollowup}
        />
      )}
    </View>
  );
}

function StepsChecklist({ steps, onStart }: { steps: StepItem[]; onStart: (item: StepItem) => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.headlineRow}>
        <Ionicons name="hand-left-outline" size={ICON_SIZE} color={theme.accentEnd} />
        <Text style={styles.title}>{stepsHeadline(steps.length)}</Text>
      </View>
      {steps.map((item) => (
        <View key={item.row.device.id} style={styles.progressRow}>
          <View style={styles.flex}>
            <Text style={styles.rowTitle} numberOfLines={1}>{item.row.title}</Text>
            <Text style={styles.hint} numberOfLines={2}>{item.instruction}</Text>
          </View>
          <Pressable style={styles.stepButton} onPress={() => onStart(item)} accessibilityRole="button" accessibilityLabel={`Start setup for ${item.row.title}`}>
            <Text style={styles.stepButtonLabel}>Start</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/** Top of the Discover list: one tap to add everything that needs no input, live progress while it runs, and a checklist for the devices that need a quick step (ADR-HEARTH-167). */
export function AddAllCard({ plan, run, followup, onAddAll, onDismissRun, onStartStep, onStartEdit, onDraftChange, onCommitEdit, onTestAll, onFinishFollowup }: AddAllCardProps) {
  if (run.phase !== "idle") {
    return (
      <RunProgress
        run={run}
        queuedSteps={plan.steps.length}
        followup={followup}
        onDismiss={onDismissRun}
        onStartEdit={onStartEdit}
        onDraftChange={onDraftChange}
        onCommitEdit={onCommitEdit}
        onTestAll={onTestAll}
        onFinishFollowup={onFinishFollowup}
      />
    );
  }
  const count = plan.auto.length;
  return (
    <View style={styles.stack}>
      {count > 0 && (
        <View style={styles.card}>
          <Text style={styles.title}>{count === 1 ? "1 device is ready" : `${count} devices are ready`}</Text>
          <Text style={styles.hint}>These connect without any extra steps.</Text>
          <CapabilityButton label={count === 1 ? "Add it" : `Add all ${count}`} variant="accent" onPress={onAddAll} />
        </View>
      )}
      {plan.steps.length > 0 && <StepsChecklist steps={plan.steps} onStart={onStartStep} />}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing.sm },
  card: { gap: theme.spacing.sm, backgroundColor: theme.surface, borderRadius: theme.radius.lg, padding: theme.spacing.lg, borderWidth: 1, borderColor: theme.accentSoft },
  headlineRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  title: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700" },
  hint: { color: theme.textSecondary, fontSize: theme.type.label },
  progressRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, minHeight: MIN_TARGET },
  flex: { flex: 1, minWidth: 0 },
  rowTitle: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "600" },
  failure: { color: theme.textSecondary, fontSize: theme.type.label },
  stepButton: { minHeight: MIN_TARGET, minWidth: 72, paddingHorizontal: theme.spacing.lg, alignItems: "center", justifyContent: "center", borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.border },
  stepButtonLabel: { color: theme.textPrimary, fontWeight: "700", fontSize: theme.type.label },
});
