import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "./theme";

export type NowViewMode = "all" | "now";

const OPTIONS: readonly { mode: NowViewMode; label: string }[] = [
  { mode: "all", label: "All" },
  { mode: "now", label: "Now" },
];

interface NowViewSwitchProps {
  value: NowViewMode;
  onChange: (mode: NowViewMode) => void;
}

/** Switches the Devices tab between the full grouped list and the "Now" summary (ADR-HEARTH-194),
 * same segmented-pill look as GroupBySwitch. */
export function NowViewSwitch({ value, onChange }: NowViewSwitchProps) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Show">
      <View style={styles.segments}>
        {OPTIONS.map((option) => {
          const selected = option.mode === value;
          return (
            <Pressable
              key={option.mode}
              style={[styles.segment, selected && styles.segmentSelected]}
              onPress={() => onChange(option.mode)}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
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
  row: { flexDirection: "row", alignItems: "center" },
  segments: { flexDirection: "row", backgroundColor: theme.surface, borderRadius: theme.radius.full, borderWidth: 1, borderColor: theme.border, padding: 2 },
  segment: { minHeight: 32, justifyContent: "center", paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.full },
  segmentSelected: { backgroundColor: theme.accentEnd },
  segmentLabel: { color: theme.textSecondary, fontSize: theme.type.label, fontWeight: "600" },
  segmentLabelSelected: { color: theme.background },
});
