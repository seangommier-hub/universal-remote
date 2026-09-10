import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "./theme";

const LETTER_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

const NUMBER_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["-", "/", ":", ";", "(", ")", "$", "&", "@", '"'],
  [".", ",", "?", "!", "'"],
];

interface ThemedKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  onDone: () => void;
}

/**
 * A software keyboard drawn in the app's own dark theme, for fields where the system keyboard's
 * white background clashes with the rest of the screen (currently just the Sony PSK field). Real
 * hardware ask (2026-09-10): "use the structure of the normal apple keyboard... formatted to
 * match the app." Paired with `showSoftInputOnFocus={false}` on the field's own TextInput, which
 * keeps focus/cursor/selection behaving normally without popping the real system keyboard.
 *
 * Every key is flex-sized, not fixed-width — the overflow bugs found earlier this session
 * (ADR-HEARTH-016, ADR-HEARTH-024) both came from fixed pixel widths not fitting every screen;
 * letting flexbox divide each row avoids that class of bug here by construction rather than by
 * one more manually-computed width.
 */
export function ThemedKeyboard({ value, onChange, onDone }: ThemedKeyboardProps) {
  const [mode, setMode] = useState<"letters" | "numbers">("letters");
  const [shift, setShift] = useState(false);

  function pressKey(char: string) {
    onChange(value + (mode === "letters" && shift ? char.toUpperCase() : char));
    if (mode === "letters" && shift) setShift(false); // one-shot, like iOS's own shift key
  }

  function backspace() {
    onChange(value.slice(0, -1));
  }

  const rows = mode === "letters" ? LETTER_ROWS : NUMBER_ROWS;

  return (
    <View style={styles.keyboard}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {rowIndex === 2 && mode === "letters" && (
            <Pressable
              onPress={() => setShift((current) => !current)}
              style={[styles.key, styles.wideKey, shift && styles.keyActive]}
              accessibilityRole="button"
              accessibilityLabel="Shift"
            >
              <Ionicons name="arrow-up-outline" size={18} color={shift ? theme.background : theme.textPrimary} />
            </Pressable>
          )}
          {row.map((char) => (
            <Pressable key={char} onPress={() => pressKey(char)} style={styles.key} accessibilityRole="button" accessibilityLabel={char}>
              <Text style={styles.keyLabel}>{mode === "letters" && shift ? char.toUpperCase() : char}</Text>
            </Pressable>
          ))}
          {rowIndex === 2 && (
            <Pressable onPress={backspace} style={[styles.key, styles.wideKey]} accessibilityRole="button" accessibilityLabel="Backspace">
              <Ionicons name="backspace-outline" size={18} color={theme.textPrimary} />
            </Pressable>
          )}
        </View>
      ))}
      <View style={styles.row}>
        <Pressable
          onPress={() => setMode((current) => (current === "letters" ? "numbers" : "letters"))}
          style={[styles.key, styles.modeKey]}
          accessibilityRole="button"
          accessibilityLabel={mode === "letters" ? "Switch to numbers and symbols" : "Switch to letters"}
        >
          <Text style={styles.keyLabel}>{mode === "letters" ? "123" : "ABC"}</Text>
        </Pressable>
        <Pressable onPress={() => pressKey(" ")} style={[styles.key, styles.spaceKey]} accessibilityRole="button" accessibilityLabel="Space">
          <Text style={styles.keyLabel}>space</Text>
        </Pressable>
        <Pressable onPress={onDone} style={[styles.key, styles.modeKey, styles.doneKey]} accessibilityRole="button" accessibilityLabel="Done">
          <Text style={[styles.keyLabel, styles.doneLabel]}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  row: { flexDirection: "row", gap: theme.spacing.xs },
  key: {
    flex: 1,
    height: 42,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  keyActive: { backgroundColor: theme.accentEnd },
  wideKey: { flex: 1.5 },
  modeKey: { flex: 1.5 },
  spaceKey: { flex: 5 },
  doneKey: { backgroundColor: theme.accentEnd },
  keyLabel: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "600" },
  doneLabel: { color: theme.background, fontWeight: "700" },
});
