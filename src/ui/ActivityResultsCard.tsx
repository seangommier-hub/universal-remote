import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { describeStep } from "../core/activities/activityChoices";
import { countStatuses } from "../core/activities/activityRunReport";
import { Activity, StepResult } from "../core/types/Activity";
import { Device } from "../core/types/Device";
import { retryableIndexes } from "../runtime/activityRunner";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface ActivityResultsCardProps {
  activity: Activity;
  steps: StepResult[];
  cancelled: boolean;
  devices: Device[];
  inputsOf: (deviceId: string) => unknown;
  onRetryFailed: () => void;
  onDismiss: () => void;
}

const STATUS_ICON = { ok: "checkmark-circle", failed: "close-circle", skipped: "remove-circle-outline" } as const;
const STATUS_COLOR = { ok: theme.statusOn, failed: theme.statusError, skipped: theme.textTertiary } as const;

function headline(name: string, steps: StepResult[], cancelled: boolean): string {
  const { ok } = countStatuses(steps);
  return `${name}: ${cancelled ? "cancelled, " : ""}${ok} of ${steps.length} steps ran`;
}

/** Per-step ok / failed / skipped results of a run, with a button to re-run whatever did not finish. */
export function ActivityResultsCard({ activity, steps, cancelled, devices, inputsOf, onRetryFailed, onDismiss }: ActivityResultsCardProps) {
  const canRetry = retryableIndexes(steps).length > 0;
  return (
    <View style={cardStyles.card}>
      <Text style={cardStyles.headline}>{headline(activity.name, steps, cancelled)}</Text>
      {steps.map((step) => {
        const definition = activity.steps[step.index];
        return (
          <View key={step.index} style={cardStyles.row}>
            <Ionicons name={STATUS_ICON[step.status]} size={18} color={STATUS_COLOR[step.status]} />
            <View style={cardStyles.rowText}>
              <Text style={cardStyles.stepText} numberOfLines={1}>
                {definition ? describeStep(definition, devices, inputsOf) : `Step ${step.index + 1}`}
              </Text>
              {step.error ? <Text style={cardStyles.errorText}>{step.error}</Text> : null}
            </View>
          </View>
        );
      })}
      <View style={cardStyles.actions}>
        <CapabilityButton label="Dismiss" variant="ghost" onPress={onDismiss} />
        {canRetry && <CapabilityButton label="Retry failed steps" variant="accent" onPress={onRetryFailed} />}
      </View>
    </View>
  );
}

const cardStyles = {
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: theme.spacing.md,
    marginTop: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  headline: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "700" as const },
  row: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: theme.spacing.sm },
  rowText: { flex: 1 },
  stepText: { color: theme.textSecondary, fontSize: theme.type.label },
  errorText: { color: theme.statusError, fontSize: theme.type.caption },
  actions: { flexDirection: "row" as const, justifyContent: "flex-end" as const, gap: theme.spacing.sm, marginTop: theme.spacing.xs },
};
