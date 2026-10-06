import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ComponentProps } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { theme } from "./theme";

// Real-device ask (2026-09-16): "add slight haptic feedback... to make the user get the feel
// like they are using an actual remote." A single Light impact fired the instant a press begins
// (onPressIn, not onPress) is what reads as a physical button's own immediate click -- onPress
// only fires on release inside the button's bounds, which would feel delayed compared to a real
// remote's tactile response. Deliberately just one pulse per tap, not a second one on release:
// two haptics for one tap reads as a buzz/glitch on real hardware, not a "click and release"
// feel, on every device this was checked against. Swallowed defensively -- expo-haptics can throw
// on a simulator/unsupported device with no real vibration hardware, and a cosmetic feature must
// never be able to break a real button press.
export function fireHapticClick(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

type IconName = ComponentProps<typeof Ionicons>["name"];

interface CapabilityButtonProps {
  label: string;
  onPress: () => void;
  /** Optional press-and-hold action (ADR-HEARTH-139). A held press fires this instead of onPress. */
  onLongPress?: () => void;
  /** ADR-HEARTH-211: optional press-in/press-out passthrough for a caller driving its own
   * hold-to-repeat (useHoldRepeat.ts) -- e.g. the d-pad's directional buttons, where a held press
   * should fire repeatedly, not once on release like onPress/onLongPress. Merged with the
   * button's own always-on haptic (onPressIn), never replacing it. Omitted (the default) renders
   * exactly as before these props existed. */
  onPressIn?: () => void;
  onPressOut?: () => void;
  variant?: "default" | "accent" | "ghost";
  disabled?: boolean;
  /** Optional leading icon (Ionicons glyph name). Purely decorative/additive — every existing call site with no icon renders exactly as before. */
  icon?: IconName;
  /** "circle" renders a fixed-size round button — used for d-pad clusters and numeric keypads. Shows an icon when one is given (label becomes accessibility-name-only, as before); shows the label as text when there's no icon (e.g. a keypad digit). Defaults to the original pill shape. */
  shape?: "pill" | "circle";
  /** Circle-shape diameter, from `theme.circleDiameter`. "sm" (the default, unchanged from before this prop existed) is every d-pad/keypad button; "lg" is for the single control on a screen that should read as the primary touch target; "xs" (ADR-HEARTH-121) is for a row with many secondary controls that must fit on one line (e.g. the remote screen's utility row) — a deliberate touch-target-size tradeoff, not a default choice. No effect on `shape="pill"`. */
  size?: "xs" | "sm" | "lg";
  /** Escape hatch for a call site whose background isn't the app's own surface colors (e.g. a live camera feed) — the built-in variants assume they're sitting on `theme.background`/`theme.surface`. Merged in last, so it can override anything. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Device-width-derived scale factor (see useResponsiveScale.ts), applied to a circle
   * button's diameter and icon size only — defaults to 1 (the original, unscaled size), so
   * every existing call site across the app renders exactly as before this prop existed. Only
   * a screen that's actually adopted responsive scaling (currently just the remote screen's
   * d-pad/rocker/keypad/utility controls) passes a real value. No effect on shape="pill". */
  scale?: number;
  /** Caps the label to one line, shrinking to fit rather than wrapping — for a fixed-width grid
   * (e.g. an input-selection tile) where a longer label wrapping to two lines would give that
   * one button a different height than its siblings, the same class of bug already fixed for
   * the utility row. Undefined (the default) renders exactly as before this prop existed — every
   * existing call site is unaffected. No effect on shape="circle", which is a single glyph/digit
   * and never has this problem. */
  numberOfLines?: number;
  /** ADR-HEARTH-180: marks this button as the "on" state of a toggle (e.g. Mute, the active
   * remote-tab, the currently-selected input/source, an armed sleep timer) — passed straight
   * through to accessibilityState.selected so VoiceOver/TalkBack announce "selected" the same
   * way sighted users read the accent-colored variant. Undefined (the default) omits the state
   * entirely, exactly as before this prop existed, for every plain action button. */
  selected?: boolean;
}

/** A single tappable control in a Universal remote screen. Rendering which of these appear is the UI's only per-device logic — everything else comes from the device's declared capabilities. */
export function CapabilityButton({
  label,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  variant = "default",
  disabled = false,
  icon,
  shape = "pill",
  size = "sm",
  containerStyle,
  scale = 1,
  numberOfLines,
  selected,
}: CapabilityButtonProps) {
  const isCircle = shape === "circle";
  const isLarge = isCircle && size === "lg";
  const isXs = isCircle && size === "xs";
  const iconColor = variant === "accent" ? theme.background : disabled ? theme.textTertiary : theme.textPrimary;
  const baseDiameter = isLarge ? theme.circleDiameter.lg : isXs ? theme.circleDiameter.xs : theme.circleDiameter.sm;
  // Only computed (and only ever applied) for a circle whose caller passed a
  // real scale -- scale===1 renders byte-for-byte the same style array as
  // before this prop existed, so no existing call site's layout changes.
  const scaledCircleStyle =
    isCircle && scale !== 1
      ? (() => {
          const diameter = baseDiameter * scale;
          return { width: diameter, height: diameter, borderRadius: diameter / 2 };
        })()
      : undefined;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={LONG_PRESS_DELAY_MS}
      onPressIn={
        disabled
          ? undefined
          : () => {
              fireHapticClick();
              onPressIn?.();
            }
      }
      onPressOut={disabled ? undefined : onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={({ pressed }) => [
        styles.button,
        isCircle && styles.circleButton,
        isLarge && styles.circleButtonLarge,
        isXs && styles.circleButtonXs,
        variant === "accent" && styles.accentButton,
        variant === "ghost" && styles.ghostButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
        scaledCircleStyle,
        containerStyle,
      ]}
    >
      <View style={styles.contentRow}>
        {icon && (
          <Ionicons
            name={icon}
            size={(isLarge ? 28 : isXs ? 16 : isCircle ? 22 : 18) * (isCircle ? scale : 1)}
            color={iconColor}
            style={!isCircle && label ? styles.iconWithLabel : undefined}
          />
        )}
        {(!icon || !isCircle) && (
          <Text
            style={[
              styles.label,
              isCircle && styles.circleLabel,
              isLarge && styles.circleLabelLarge,
              variant === "accent" && styles.accentLabel,
              variant === "ghost" && styles.ghostLabel,
              disabled && styles.disabledLabel,
            ]}
            numberOfLines={numberOfLines}
            adjustsFontSizeToFit={numberOfLines !== undefined}
            minimumFontScale={numberOfLines !== undefined ? 0.75 : undefined}
          >
            {label}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const LONG_PRESS_DELAY_MS = 400;

const styles = StyleSheet.create({
  button: {
    minWidth: 64,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  circleButton: {
    minWidth: 0,
    width: theme.circleDiameter.sm,
    height: theme.circleDiameter.sm,
    padding: 0,
    borderRadius: theme.radius.full,
  },
  circleButtonLarge: {
    width: theme.circleDiameter.lg,
    height: theme.circleDiameter.lg,
  },
  circleButtonXs: {
    width: theme.circleDiameter.xs,
    height: theme.circleDiameter.xs,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  iconWithLabel: {
    marginRight: theme.spacing.sm,
  },
  accentButton: {
    backgroundColor: theme.accentEnd,
    borderColor: theme.accentEnd,
  },
  ghostButton: {
    backgroundColor: "transparent",
    borderColor: theme.border,
  },
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.35,
  },
  label: {
    color: theme.textPrimary,
    fontSize: theme.type.body,
    fontWeight: "600",
  },
  circleLabel: {
    fontSize: theme.type.subtitle,
    fontWeight: "700",
  },
  circleLabelLarge: {
    fontSize: theme.type.title,
  },
  accentLabel: {
    color: theme.background,
  },
  ghostLabel: {
    color: theme.textSecondary,
  },
  disabledLabel: {
    color: theme.textTertiary,
  },
});
