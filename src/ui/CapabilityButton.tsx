import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "./theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

interface CapabilityButtonProps {
  label: string;
  onPress: () => void;
  variant?: "default" | "accent" | "ghost";
  disabled?: boolean;
  /** Optional leading icon (Ionicons glyph name). Purely decorative/additive — every existing call site with no icon renders exactly as before. */
  icon?: IconName;
  /** "circle" renders a fixed-size round button (icon-only, label used as the accessibility name) — used for d-pad clusters. Defaults to the original pill shape. */
  shape?: "pill" | "circle";
}

/** A single tappable control in a Universal remote screen. Rendering which of these appear is the UI's only per-device logic — everything else comes from the device's declared capabilities. */
export function CapabilityButton({
  label,
  onPress,
  variant = "default",
  disabled = false,
  icon,
  shape = "pill",
}: CapabilityButtonProps) {
  const isCircle = shape === "circle";
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
        variant === "accent" && styles.accentButton,
        variant === "ghost" && styles.ghostButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.contentRow}>
        {icon && <Ionicons name={icon} size={isCircle ? 22 : 18} color={iconColor} style={!isCircle && label ? styles.iconWithLabel : undefined} />}
        {!isCircle && (
          <Text
            style={[
              styles.label,
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
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: theme.radius.md,
    backgroundColor: theme.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  circleButton: {
    minWidth: 0,
    width: 52,
    height: 52,
    padding: 0,
    borderRadius: theme.radius.full,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  iconWithLabel: {
    marginRight: 8,
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
