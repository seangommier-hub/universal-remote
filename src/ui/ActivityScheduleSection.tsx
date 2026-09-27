import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { ActivitySchedule } from "../core/types/Activity";
import { addSchedule, newSchedule, removeSchedule, toggleDay, updateSchedule } from "../core/activities/scheduleEditing";
import { describeStoredTime, nextOccurrence, parseTypedTime, WEEKDAY_SHORT_NAMES } from "../core/activities/scheduleTime";
import { MAX_SCHEDULES_PER_ACTIVITY } from "../core/activities/activityLimits";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

const ICON_SIZE = 20;
const DAY_CHIP_SIZE = 38;
const TIME_INPUT_WIDTH = 110;

interface ActivityScheduleSectionProps {
  schedules: ActivitySchedule[];
  onChange: (schedules: ActivitySchedule[]) => void;
  newId: () => string;
  /** Plain-language reasons some steps will not run on a schedule; empty when every step can. */
  skippedStepNotes: string[];
}

function describeNextRun(schedule: ActivitySchedule): string {
  if (!schedule.enabled) return "Paused";
  const next = nextOccurrence(schedule.days, schedule.at, new Date());
  if (!next) return "";
  return `Next: ${WEEKDAY_SHORT_NAMES[next.getDay()]} ${describeStoredTime(schedule.at)}`;
}

function TimeField({ at, onCommit }: { at: string; onCommit: (at: string) => void }) {
  const [text, setText] = useState(describeStoredTime(at));
  const [invalid, setInvalid] = useState(false);
  function commit() {
    const parsed = parseTypedTime(text);
    setInvalid(parsed === null);
    if (parsed === null) return;
    setText(describeStoredTime(parsed));
    onCommit(parsed);
  }
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onBlur={commit}
      onSubmitEditing={commit}
      accessibilityLabel="Time to run"
      placeholder="8:30 PM"
      placeholderTextColor={theme.textTertiary}
      autoCapitalize="characters"
      style={[scheduleStyles.timeInput, invalid && { borderColor: theme.statusError }]}
    />
  );
}

function DayChips({ days, onToggle }: { days: number[]; onToggle: (day: number) => void }) {
  return (
    <View style={scheduleStyles.dayRow}>
      {WEEKDAY_SHORT_NAMES.map((name, day) => {
        const selected = days.includes(day);
        return (
          <Pressable
            key={name}
            onPress={() => onToggle(day)}
            accessibilityRole="button"
            accessibilityLabel={`${name}${selected ? ", selected" : ""}`}
            accessibilityState={{ selected }}
            style={[scheduleStyles.dayChip, selected && scheduleStyles.dayChipSelected]}
          >
            <Text style={[scheduleStyles.dayText, selected && scheduleStyles.dayTextSelected]}>{name.slice(0, 2)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ScheduleRow({ schedule, onChange, onRemove }: { schedule: ActivitySchedule; onChange: (change: Partial<ActivitySchedule>) => void; onRemove: () => void }) {
  return (
    <View style={scheduleStyles.card}>
      <View style={scheduleStyles.topRow}>
        <TimeField at={schedule.at} onCommit={(at) => onChange({ at })} />
        <Text style={scheduleStyles.next}>{describeNextRun(schedule)}</Text>
        <Switch value={schedule.enabled} onValueChange={(enabled) => onChange({ enabled })} accessibilityLabel="Schedule enabled" />
        <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel="Remove schedule" hitSlop={6}>
          <Ionicons name="close-circle" size={ICON_SIZE} color={theme.textSecondary} />
        </Pressable>
      </View>
      <DayChips days={schedule.days} onToggle={(day) => onChange({ days: toggleDay(schedule.days, day) })} />
      {schedule.days.length === 0 && <Text style={scheduleStyles.problem}>Pick at least one day.</Text>}
    </View>
  );
}

/**
 * Optional automatic run times for an Activity (ADR-HEARTH-177): days-of-week chips, a time and an on/off
 * switch per schedule. The Family Command Center runs them with no phone open, in its own timezone, and
 * only for the steps it can drive unattended; anything else is listed here so nothing is a surprise.
 */
export function ActivityScheduleSection({ schedules, onChange, newId, skippedStepNotes }: ActivityScheduleSectionProps) {
  return (
    <View style={scheduleStyles.section}>
      <Text style={scheduleStyles.heading}>Schedule (optional)</Text>
      <Text style={scheduleStyles.hint}>
        Runs by itself on the home hub, even when no phone is open, using the hub's clock and timezone. If the hub was off at the time, it
        runs only when less than 10 minutes late.
      </Text>
      {schedules.map((schedule) => (
        <ScheduleRow
          key={schedule.id}
          schedule={schedule}
          onChange={(change) => onChange(updateSchedule(schedules, schedule.id, change))}
          onRemove={() => onChange(removeSchedule(schedules, schedule.id))}
        />
      ))}
      {schedules.length < MAX_SCHEDULES_PER_ACTIVITY && (
        <View style={scheduleStyles.addRow}>
          <CapabilityButton label="Add a schedule" icon="alarm-outline" onPress={() => onChange(addSchedule(schedules, newSchedule(newId())))} />
        </View>
      )}
      {schedules.length > 0 &&
        skippedStepNotes.map((note) => (
          <Text key={note} style={scheduleStyles.warning}>
            {note}
          </Text>
        ))}
    </View>
  );
}

const scheduleStyles = {
  section: { gap: theme.spacing.sm, marginTop: theme.spacing.lg },
  heading: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "700" as const },
  hint: { color: theme.textTertiary, fontSize: theme.type.caption },
  card: { backgroundColor: theme.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.borderSubtle, padding: theme.spacing.md, gap: theme.spacing.sm },
  topRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: theme.spacing.sm },
  timeInput: {
    width: TIME_INPUT_WIDTH,
    color: theme.textPrimary,
    fontSize: theme.type.body,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  next: { flex: 1, color: theme.textSecondary, fontSize: theme.type.caption },
  dayRow: { flexDirection: "row" as const, justifyContent: "space-between" as const },
  dayChip: { width: DAY_CHIP_SIZE, height: DAY_CHIP_SIZE, borderRadius: DAY_CHIP_SIZE / 2, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: theme.surfaceRaised },
  dayChipSelected: { backgroundColor: theme.accentEnd },
  dayText: { color: theme.textSecondary, fontSize: theme.type.label, fontWeight: "600" as const },
  dayTextSelected: { color: theme.background },
  addRow: { flexDirection: "row" as const },
  problem: { color: theme.statusError, fontSize: theme.type.caption },
  warning: { color: theme.statusError, fontSize: theme.type.caption },
};
