import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { describeStep } from "../core/activities/activityChoices";
import { cycleWaitCondition, describeFailurePolicy, nextFailurePolicy, nudgeDelay } from "../core/activities/activityStepEditing";
import { WAIT_TIMEOUT_MAX_MS, WAIT_TIMEOUT_MIN_MS } from "../core/activities/activityLimits";
import { clampNumber } from "../core/activities/activityModel";
import { ActivityStep } from "../core/types/Activity";
import { Device } from "../core/types/Device";
import { theme } from "./theme";

const DELAY_NUDGE_MS = 1000;
const WAIT_NUDGE_MS = 5000;
const ICON_SIZE = 20;

interface ActivityStepRowProps {
  index: number;
  step: ActivityStep;
  devices: Device[];
  inputsOf: (deviceId: string) => unknown;
  isFirst: boolean;
  isLast: boolean;
  onChange: (step: ActivityStep) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

function IconButton({ name, label, onPress, disabled }: { name: "arrow-up" | "arrow-down" | "close-circle" | "add" | "remove"; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={{ opacity: disabled ? 0.3 : 1 }}>
      <Ionicons name={name} size={ICON_SIZE} color={theme.textSecondary} />
    </Pressable>
  );
}

function StepOptions({ step, onChange }: { step: ActivityStep; onChange: (step: ActivityStep) => void }) {
  if (step.kind === "command") {
    return (
      <Pressable onPress={() => onChange({ ...step, onFail: nextFailurePolicy(step.onFail) })} accessibilityRole="button" accessibilityLabel="Change what happens if this step fails">
        <Text style={rowStyles.option}>{describeFailurePolicy(step.onFail)}</Text>
      </Pressable>
    );
  }
  if (step.kind === "delay") {
    return (
      <View style={rowStyles.optionRow}>
        <IconButton name="remove" label="Shorten delay" onPress={() => onChange(nudgeDelay(step, -DELAY_NUDGE_MS))} />
        <IconButton name="add" label="Lengthen delay" onPress={() => onChange(nudgeDelay(step, DELAY_NUDGE_MS))} />
      </View>
    );
  }
  const seconds = Math.round(step.timeoutMs / 1000);
  const timeoutText = step.onTimeout === "continue" ? "keep going" : "stop";
  return (
    <View style={rowStyles.optionRow}>
      <Pressable onPress={() => onChange(cycleWaitCondition(step))} accessibilityRole="button" accessibilityLabel="Change what to wait for">
        <Text style={rowStyles.option}>Switch on/off</Text>
      </Pressable>
      <IconButton name="remove" label="Shorten wait limit" onPress={() => onChange({ ...step, timeoutMs: clampNumber(step.timeoutMs - WAIT_NUDGE_MS, WAIT_TIMEOUT_MIN_MS, WAIT_TIMEOUT_MAX_MS) })} />
      <Text style={rowStyles.option}>{seconds}s</Text>
      <IconButton name="add" label="Lengthen wait limit" onPress={() => onChange({ ...step, timeoutMs: clampNumber(step.timeoutMs + WAIT_NUDGE_MS, WAIT_TIMEOUT_MIN_MS, WAIT_TIMEOUT_MAX_MS) })} />
      <Pressable onPress={() => onChange({ ...step, onTimeout: step.onTimeout === "continue" ? "stop" : "continue" })} accessibilityRole="button" accessibilityLabel="Change what happens on timeout">
        <Text style={rowStyles.option}>On timeout: {timeoutText}</Text>
      </Pressable>
    </View>
  );
}

/** One numbered step in the editor: what it does, its per-kind options, and move / remove controls. */
export function ActivityStepRow({ index, step, devices, inputsOf, isFirst, isLast, onChange, onMove, onRemove }: ActivityStepRowProps) {
  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.main}>
        <Text style={rowStyles.title} numberOfLines={2}>
          {index + 1}. {describeStep(step, devices, inputsOf)}
        </Text>
        <StepOptions step={step} onChange={onChange} />
      </View>
      <View style={rowStyles.controls}>
        <IconButton name="arrow-up" label={`Move step ${index + 1} up`} onPress={() => onMove(-1)} disabled={isFirst} />
        <IconButton name="arrow-down" label={`Move step ${index + 1} down`} onPress={() => onMove(1)} disabled={isLast} />
        <IconButton name="close-circle" label={`Remove step ${index + 1}`} onPress={onRemove} />
      </View>
    </View>
  );
}

const rowStyles = {
  row: { flexDirection: "row" as const, alignItems: "center" as const, gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  main: { flex: 1, gap: 2 },
  title: { color: theme.textPrimary, fontSize: theme.type.label },
  optionRow: { flexDirection: "row" as const, alignItems: "center" as const, flexWrap: "wrap" as const, gap: theme.spacing.sm },
  option: { color: theme.textTertiary, fontSize: theme.type.caption },
  controls: { flexDirection: "row" as const, alignItems: "center" as const, gap: theme.spacing.sm },
};
