import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { commandChoicesFor, commandStepFromChoice } from "../core/activities/activityChoices";
import { ACTIVITY_NAME_MAX } from "../core/activities/activityLimits";
import { validateActivity } from "../core/activities/activityModel";
import { appendStep, moveStep, newActivityDraft, newDelayStep, newWaitStep, removeStepAt, replaceStep } from "../core/activities/activityStepEditing";
import { StateStore } from "../core/state/StateStore";
import { unsupportedHeadlessSteps } from "../core/activities/headlessSupport";
import { Activity, ActivitySchedule, ActivityStep } from "../core/types/Activity";
import { Device } from "../core/types/Device";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { ActivityResultsCard } from "./ActivityResultsCard";
import { ActivityScheduleSection } from "./ActivityScheduleSection";
import { ActivityStepRow } from "./ActivityStepRow";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";
import { ActivityProgress, LastActivityRun } from "./useActivities";

interface ActivityEditorScreenProps {
  devices: Device[];
  stateStore: StateStore;
  onCancel: () => void;
  onSaved: (activity: Activity) => void;
  /** When given, edits this existing activity in place (same id and base version on save). */
  editingActivity?: Activity;
  newActivityId: () => string;
  onTestRun: (activity: Activity) => void;
  onCancelRun: () => void;
  onRetryFailed: () => void;
  onDismissRun: () => void;
  progress: ActivityProgress | null;
  lastRun: LastActivityRun | null;
  memberName?: string;
  onMemberNameChange: (name: string) => void;
}

/**
 * Builds or edits an Activity (ADR-HEARTH-150): a name plus ordered steps of three kinds — a device
 * command, a fixed delay, or "wait until a device is on/off". Every device's picker is driven by
 * the capabilities it declares. Steps can be reordered and removed, and "Test run" executes the
 * draft immediately and shows per-step results with a retry for whatever did not finish. Scenes
 * saved by earlier versions open here as activities of command steps (ADR-HEARTH-056/058/059/061).
 */
export function ActivityEditorScreen(props: ActivityEditorScreenProps) {
  const { devices, stateStore, onCancel, onSaved, editingActivity, newActivityId, progress, lastRun } = props;
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(editingActivity?.name ?? "");
  const [steps, setSteps] = useState<ActivityStep[]>(editingActivity?.steps ?? []);
  const [schedules, setSchedules] = useState<ActivitySchedule[]>(editingActivity?.schedules ?? []);
  const [draftId] = useState(() => editingActivity?.id ?? newActivityId());
  const isEditing = editingActivity !== undefined;
  const inputsOf = (deviceId: string) => stateStore.get(deviceId).values.inputs;

  function buildDraft(): Activity {
    const base = editingActivity ?? newActivityDraft(draftId, name, steps, new Date().toISOString());
    const keepsSchedules = schedules.length > 0 || editingActivity?.schedules !== undefined;
    return { ...base, name: name.trim(), steps, ...(keepsSchedules ? { schedules } : {}) };
  }

  const driverIdOf = (deviceId: string) => devices.find((device) => device.id === deviceId)?.driverId;
  const skippedStepNotes = unsupportedHeadlessSteps({ ...newActivityDraft("draft", name, steps, ""), steps }, driverIdOf).map(
    ({ index, reason }) => `Step ${index + 1} will be skipped on a schedule: ${reason}.`
  );

  const draftProblem = validateActivity({ ...(editingActivity ?? newActivityDraft("draft", name, steps, "")), name, steps, schedules });
  const isRunning = progress !== null;
  const inlineRun = lastRun && lastRun.surface === "inline" && lastRun.activity.id === draftId ? lastRun : null;
  const usableDevices = devices.filter((device) => commandChoicesFor(device, inputsOf(device.id)).length > 0);

  function handleTestRun() {
    props.onTestRun(buildDraft());
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg, paddingBottom: theme.spacing.xxl }]}>
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="flash-outline" size={20} color={theme.accentEnd} />
          </View>
          <Text style={styles.title}>{isEditing ? "Edit Activity" : "New Activity"}</Text>
        </View>
        <View style={styles.hintCard}>
          <Text style={styles.hint}>
            Steps run in order when you tap the activity, and are shared with every phone in the household. Add a wait after power-on so the
            next step only runs once the device is really on.
          </Text>
        </View>

        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={ACTIVITY_NAME_MAX} placeholder="Movie Night" placeholderTextColor={theme.textTertiary} />

        <Text style={styles.label}>Steps ({steps.length})</Text>
        <View style={editorStyles.stepList}>
          {steps.length === 0 && <Text style={editorStyles.empty}>No steps yet — add one below.</Text>}
          {steps.map((step, index) => (
            <ActivityStepRow
              key={`${index}-${step.kind}`}
              index={index}
              step={step}
              devices={devices}
              inputsOf={inputsOf}
              isFirst={index === 0}
              isLast={index === steps.length - 1}
              onChange={(updated) => setSteps((current) => replaceStep(current, index, updated))}
              onMove={(direction) => setSteps((current) => moveStep(current, index, direction))}
              onRemove={() => setSteps((current) => removeStepAt(current, index))}
            />
          ))}
        </View>

        <Text style={styles.label}>Add a step</Text>
        <View style={editorStyles.chipRow}>
          <CapabilityButton label="Delay" icon="time-outline" onPress={() => setSteps((current) => appendStep(current, newDelayStep()))} />
        </View>
        {usableDevices.length === 0 && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
            <Text style={styles.error}>No paired devices have an action activities can use yet.</Text>
          </View>
        )}
        {usableDevices.map((device) => (
          <View key={device.id} style={editorStyles.deviceSection}>
            <Text style={editorStyles.deviceName}>{device.name}</Text>
            <View style={editorStyles.chipRow}>
              {commandChoicesFor(device, inputsOf(device.id)).map((choice) => (
                <CapabilityButton key={choice.key} label={choice.label} onPress={() => setSteps((current) => appendStep(current, commandStepFromChoice(device.id, choice)))} />
              ))}
              <CapabilityButton label="Wait until on" icon="hourglass-outline" onPress={() => setSteps((current) => appendStep(current, newWaitStep(device.id)))} />
            </View>
          </View>
        ))}

        <ActivityScheduleSection schedules={schedules} onChange={setSchedules} newId={newActivityId} skippedStepNotes={skippedStepNotes} />

        {draftProblem && steps.length > 0 && <Text style={editorStyles.problem}>{draftProblem}</Text>}
        {isRunning && (
          <Text style={editorStyles.progress}>
            Running step {progress.index + 1} of {progress.total}...
          </Text>
        )}
        {inlineRun && (
          <ActivityResultsCard
            activity={inlineRun.activity}
            steps={inlineRun.steps}
            cancelled={inlineRun.result.cancelled}
            devices={devices}
            inputsOf={inputsOf}
            onRetryFailed={props.onRetryFailed}
            onDismiss={props.onDismissRun}
          />
        )}

        <Text style={styles.label}>Your name in run history</Text>
        <TextInput style={styles.input} value={props.memberName ?? ""} onChangeText={props.onMemberNameChange} placeholder="e.g. Leah" placeholderTextColor={theme.textTertiary} />

        <View style={styles.row}>
          <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} />
          {isRunning ? (
            <CapabilityButton label="Stop run" variant="ghost" onPress={props.onCancelRun} />
          ) : (
            <CapabilityButton label="Test run" variant="default" onPress={handleTestRun} disabled={draftProblem !== null} />
          )}
          <CapabilityButton label={isEditing ? "Save Changes" : "Save"} variant="accent" onPress={() => onSaved(buildDraft())} disabled={draftProblem !== null} />
        </View>
      </ScrollView>
    </View>
  );
}

const editorStyles = {
  stepList: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  empty: { color: theme.textTertiary, fontSize: theme.type.label },
  deviceSection: { marginTop: theme.spacing.md, gap: theme.spacing.xs },
  deviceName: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "700" as const },
  chipRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, columnGap: theme.spacing.sm, rowGap: theme.spacing.sm },
  problem: { color: theme.statusError, fontSize: theme.type.label, marginTop: theme.spacing.sm },
  progress: { color: theme.accentEnd, fontSize: theme.type.label, marginTop: theme.spacing.sm },
};
