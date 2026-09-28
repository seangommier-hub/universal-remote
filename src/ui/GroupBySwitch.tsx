import { Pressable, StyleSheet, Text, View } from "react-native";
import { GroupByMode } from "../core/layout/deviceLayout";
import { theme } from "./theme";

const OPTIONS: readonly { mode: GroupByMode; label: string }[] = [
  { mode: "type", label: "Type" },
  { mode: "room", label: "Room" },
];

interface GroupBySwitchProps {
  value: GroupByMode;
  onChange: (mode: GroupByMode) => void;
}

/** A small "Group by: Type | Room" switch for the Devices list (ADR-HEARTH-193). */
export function GroupBySwitch({ value, onChange }: GroupBySwitchProps) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Group devices by">
      <Text style={styles.caption}>Group by</Text>
      <View style={styles.segments}>
        {OPTIONS.map((option) => {
          const selected = option.mode === value;
          return (
            <Pressable
              key={option.mode}
              style={[styles.segment, selected && styles.segmentSelected]}
              onPress={() => onChange(option.mode)}
              accessibilityRole="radio"
              accessibilityLabel={`Group by ${option.label}`}
              accessibilityState={{ selected }}
            >
              <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  caption: { color: theme.textSecondary, fontSize: theme.type.label },
  segments: { flexDirection: "row", backgroundColor: theme.surface, borderRadius: theme.radius.full, borderWidth: 1, borderColor: theme.border, padding: 2 },
  segment: { minHeight: 32, justifyContent: "center", paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.full },
  segmentSelected: { backgroundColor: theme.accentEnd },
  segmentLabel: { color: theme.textSecondary, fontSize: theme.type.label, fontWeight: "600" },
  segmentLabelSelected: { color: theme.background },
});
