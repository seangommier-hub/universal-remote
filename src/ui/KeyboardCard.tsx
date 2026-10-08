import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fireHapticClick } from "./CapabilityButton";
import { KeyboardKey, KeyboardLayer, keyboardRows } from "./onScreenKeyboard";
import { remoteCardStyles } from "./remoteCardStyles";
import { useRemoteScaled } from "./RemoteScaleContext";
import { theme } from "./theme";

const KEY_HEIGHT = 40;
const KEY_ICON_SIZE = 20;

interface KeyboardCardProps {
  /** Local echo of what was just typed (the TV, not Hearth, holds the real text). */
  echo: string;
  disabled: boolean;
  /** Whether a select/OK capability exists to send on Enter -- same gate the Keypad tab's Enter uses. */
  canSubmit: boolean;
  onKey: (char: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
}

/**
 * The remote screen's "Keyboard" tab (ADR-HEARTH-220) -- Hearth's own on-screen keyboard, not the
 * phone's. Every tap is sent to the TV immediately, one key at a time, the same way the Keypad tab
 * sends digits, so it works where a finished-string "Send" never did.
 */
export function KeyboardCard({ echo, disabled, canSubmit, onKey, onBackspace, onEnter }: KeyboardCardProps) {
  const { size, font } = useRemoteScaled();
  const [layer, setLayer] = useState<KeyboardLayer>("letters");
  const [shift, setShift] = useState(false);
  const rows = keyboardRows(layer, shift);

  function press(key: KeyboardKey) {
    switch (key.kind) {
      case "char":
        onKey(key.char);
        if (shift) setShift(false); // one-shot shift, like a phone keyboard
        return;
      case "space":
        onKey(" ");
        return;
      case "backspace":
        onBackspace();
        return;
      case "enter":
        onEnter();
        return;
      case "shift":
        setShift((current) => !current);
        return;
      case "layer":
        setLayer(key.to);
        setShift(false);
    }
  }

  return (
    <View style={[remoteCardStyles.card, { padding: size(theme.spacing.md), gap: size(theme.spacing.sm), borderRadius: size(theme.radius.lg) }]}>
      <View style={styles.header}>
        <Text style={[remoteCardStyles.cardLabel, { fontSize: font(theme.type.label) }]}>Type on the TV</Text>
        <Text style={[styles.echo, { fontSize: font(theme.type.body) }]} numberOfLines={1}>
          {echo.length > 0 ? echo : "—"}
        </Text>
      </View>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.row, { gap: size(theme.spacing.xs) }]}>
          {row.map((key, keyIndex) => (
            <KeyButton
              key={`${rowIndex}-${keyIndex}`}
              keyDef={key}
              shift={shift}
              disabled={disabled || (key.kind === "enter" && !canSubmit)}
              height={size(KEY_HEIGHT)}
              fontSize={font(theme.type.body)}
              iconSize={size(KEY_ICON_SIZE)}
              onPress={() => press(key)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

interface KeyButtonProps {
  keyDef: KeyboardKey;
  shift: boolean;
  disabled: boolean;
  height: number;
  fontSize: number;
  iconSize: number;
  onPress: () => void;
}

function keyLabel(key: KeyboardKey): string {
  switch (key.kind) {
    case "char":
      return key.char;
    case "space":
      return "space";
    case "layer":
      return key.label;
    case "enter":
      return "Enter";
    case "backspace":
      return "Delete";
    case "shift":
      return "Shift";
  }
}

function KeyButton({ keyDef, shift, disabled, height, fontSize, iconSize, onPress }: KeyButtonProps) {
  const isIcon = keyDef.kind === "shift" || keyDef.kind === "backspace" || keyDef.kind === "enter";
  const isWide = keyDef.kind === "space";
  const isAccent = keyDef.kind === "enter" || (keyDef.kind === "shift" && shift);
  const iconName = keyDef.kind === "shift" ? "arrow-up" : keyDef.kind === "backspace" ? "backspace-outline" : "checkmark";
  return (
    <Pressable
      onPress={onPress}
      onPressIn={disabled ? undefined : fireHapticClick}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={keyLabel(keyDef)}
      style={({ pressed }) => [
        styles.key,
        { height, borderRadius: theme.radius.sm },
        isWide && styles.keyWide,
        (isIcon || keyDef.kind === "layer") && styles.keyModifier,
        isAccent && styles.keyAccent,
        pressed && styles.keyPressed,
        disabled && styles.keyDisabled,
      ]}
    >
      {isIcon ? (
        <Ionicons name={iconName} size={iconSize} color={isAccent ? theme.background : theme.textPrimary} />
      ) : (
        <Text style={[styles.keyLabel, { fontSize: keyDef.kind === "layer" || isWide ? fontSize * 0.8 : fontSize }]} numberOfLines={1}>
          {keyLabel(keyDef)}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm },
  echo: { flex: 1, color: theme.textPrimary, fontWeight: "700", textAlign: "right" },
  row: { flexDirection: "row", justifyContent: "center" },
  key: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.border,
  },
  keyWide: { flex: 4 },
  keyModifier: { flex: 1.4, backgroundColor: theme.surface },
  keyAccent: { backgroundColor: theme.accentEnd, borderColor: theme.accentEnd },
  keyPressed: { opacity: 0.6 },
  keyDisabled: { opacity: 0.35 },
  keyLabel: { color: theme.textPrimary, fontWeight: "600" },
});
