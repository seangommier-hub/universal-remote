import { useState } from "react";
import { GestureResponderEvent, LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

const MIN_PERCENT = 0;
const MAX_PERCENT = 100;
const KEYBOARD_STEP = 10;
const THUMB_SIZE = 26;
const TRACK_HEIGHT = 8;

interface PercentSliderProps {
  label: string;
  /** Current value from the device, 0 to 100. */
  value: number;
  disabled?: boolean;
  /** Called once when the finger lifts (or an accessibility step is made), not on every move. */
  onCommit: (percent: number) => void;
}

function clampPercent(value: number): number {
  return Math.max(MIN_PERCENT, Math.min(MAX_PERCENT, Math.round(value)));
}

/** A 0-100 slider drawn from plain Views (no extra dependency): drag to choose, release to send; screen readers step it by 10. */
export function PercentSlider({ label, value, disabled = false, onCommit }: PercentSliderProps) {
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? clampPercent(value);

  function percentAt(event: GestureResponderEvent): number {
    return width > 0 ? clampPercent((event.nativeEvent.locationX / width) * MAX_PERCENT) : shown;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.value}>{shown}%</Text>
      <View
        style={[styles.hitArea, disabled && styles.disabled]}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        onResponderGrant={(event) => setDragging(percentAt(event))}
        onResponderMove={(event) => setDragging(percentAt(event))}
        onResponderRelease={(event) => {
          setDragging(null);
          onCommit(percentAt(event));
        }}
        onResponderTerminate={() => setDragging(null)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: MIN_PERCENT, max: MAX_PERCENT, now: shown }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          const delta = event.nativeEvent.actionName === "increment" ? KEYBOARD_STEP : -KEYBOARD_STEP;
          onCommit(clampPercent(shown + delta));
        }}
      >
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.fill, { width: `${shown}%` }]} />
        </View>
        <View style={[styles.thumb, { left: `${shown}%` }]} pointerEvents="none" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  value: { color: theme.textPrimary, fontSize: theme.type.title, fontWeight: "700" },
  hitArea: { height: THUMB_SIZE * 2, justifyContent: "center" },
  disabled: { opacity: 0.4 },
  track: { height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2, backgroundColor: theme.surfaceOverlay, overflow: "hidden" },
  fill: { height: TRACK_HEIGHT, backgroundColor: theme.accentEnd },
  thumb: {
    position: "absolute",
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    marginLeft: -THUMB_SIZE / 2,
    backgroundColor: theme.textPrimary,
    borderWidth: 3,
    borderColor: theme.accentEnd,
  },
});
