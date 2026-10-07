import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

// Sean's reference (2026-09-10): a real remote app's secondary controls (mute, back, home, menu)
// read as one row of icon-over-caption chips, not horizontal icon+text pills — matches how a
// physical remote's own secondary buttons are labeled (engraved, small, below the button) rather
// than lettered inside it. One small local component since this exact pairing repeats several
// times in the utility row (UtilityActionsRow.tsx).
/** One icon-over-caption chip in the remote screen's utility row (Home/Menu/Mute/Back/...). */
export function UtilityAction({
  icon,
  label,
  onPress,
  disabled,
  active,
  scale,
  fitScale = 1,
  columns,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled: boolean;
  active?: boolean;
  scale: number;
  /** ADR-HEARTH-217: the live overflow-correction factor (useRemoteFitScale), defaulting to 1 so
   * a caller that hasn't adopted it (none currently; kept optional for the same reason `scale`
   * itself defaults safely elsewhere) renders exactly as before. Multiplied into this button's own
   * circle size as a genuine last resort, only once the hub and every card's own padding/gaps have
   * already shrunk as far as fitScale.ts's floor allows and the screen still doesn't fit (the real
   * case this exists for: a short device, e.g. iPhone SE's 667pt height, combined with a
   * capability-heavy device). ADR-HEARTH-134's 52px circle has real room above the 32px "xs" size
   * ADR-HEARTH-121 already shipped and ADR-HEARTH-134 itself only reversed on taste, not legibility
   * grounds -- shrinking toward, not below, that already-shipped size on a genuinely tight device
   * is a real tradeoff this screen has shipped before, not a new one. */
  fitScale?: number;
  columns: number;
}) {
  const effectiveScale = scale * fitScale;
  return (
    <View style={[styles.utilityAction, { width: `${100 / columns}%` }]}>
      <CapabilityButton
        shape="circle"
        size="sm"
        scale={effectiveScale}
        icon={icon}
        label={label}
        variant={active ? "accent" : "default"}
        selected={active}
        onPress={onPress}
        disabled={disabled}
      />
      {/* ADR-HEARTH-180: hidden from VoiceOver/TalkBack — this caption repeats the exact text the
          button above already carries as its own accessibilityLabel, so leaving it exposed would
          announce the same word twice for every utility action on this screen. */}
      <Text style={styles.utilityActionLabel} numberOfLines={1} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Real-device finding (2026-09-10): "the settings label/button is still overlapping" — an
  // unconstrained-width column meant a longer caption ("Settings") could wrap to a second line
  // while its siblings ("Mute", "Home") stayed single-line, giving that one item a different
  // total height than the row it wrapped alongside — visually reading as two rows overlapping.
  // Fixed width + single line + tail-ellipsis makes every utility action exactly the same height,
  // no matter how long its label is, so a wrapped grid can never have mismatched row heights.
  utilityAction: { alignItems: "center", gap: theme.spacing.xs },
  utilityActionLabel: { color: theme.textSecondary, fontSize: theme.type.caption, fontWeight: "600", textAlign: "center" },
});
