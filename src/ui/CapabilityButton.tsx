import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { theme } from "./theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

interface CapabilityButtonProps {
  label: string;
  onPress: () => void;
  variant?: "default" | "accent" | "ghost";
  disabled?: boolean;
  /** Optional leading icon (Ionicons glyph name). Purely decorative/additive — every existing call site with no icon renders exactly as before. */
  icon?: IconName;
  /** "circle" renders a fixed-size round button — used for d-pad clusters and numeric keypads. Shows an icon when one is given (label becomes accessibility-name-only, as before); shows the label as text when there's no icon (e.g. a keypad digit). Defaults to the original pill shape. */
  shape?: "pill" | "circle";
  /** Circle-shape diameter, from `theme.circleDiameter`. "sm" (the default, unchanged from before this prop existed) is every d-pad/keypad button; "lg" is for the single control on a screen that should read as the primary touch target. No effect on `shape="pill"`. */
  size?: "sm" | "lg";
  /** Escape hatch for a call site whose background isn't the app's own surface colors (e.g. a live camera feed) — the built-in variants assume they're sitting on `theme.background`/`theme.surface`. Merged in last, so it can override anything. */
  containerStyle?: StyleProp<ViewStyle>;
}

/** A single tappable control in a Universal remote screen. Rendering which of these appear is the UI's only per-device logic — everything else comes from the device's declared capabilities. */
export function CapabilityButton({
  label,
  onPress,
  variant = "default",
  disabled = false,
  icon,
  shape = "pill",
  size = "sm",
  containerStyle,
}: CapabilityButtonProps) {
  const isCircle = shape === "circle";
  const isLarge = isCircle && size === "lg";
  const iconColor = variant === "accent" ? theme.background : disabled ? theme.textTertiary : theme.textPrimary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        isCircle && styles.circleButton,
        isLarge && styles.circleButtonLarge,
        variant === "accent" && styles.accentButton,
        variant === "ghost" && styles.ghostButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
        containerStyle,
      ]}
    >
      <View style={styles.contentRow}>
        {icon && (
          <Ionicons
            name={icon}
            size={isLarge ? 28 : isCircle ? 22 : 18}
            color={iconColor}
            style={!isCircle && label ? styles.iconWithLabel : undefined}
          />
        )}
        {!icon && (
          <Text
            style={[
              styles.label,
              isCircle && styles.circleLabel,
              isLarge && styles.circleLabelLarge,
              variant === "accent" && styles.accentLabel,
              variant === "ghost" && styles.ghostLabel,
              disabled && styles.disabledLabel,
            ]}
          >
            {label}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

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
