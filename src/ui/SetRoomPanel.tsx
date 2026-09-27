import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { cleanRoomName, MAX_ROOM_NAME_LENGTH } from "../core/layout/deviceLayout";
import { actionModalStyles as modal } from "./actionModalStyles";
import { theme } from "./theme";

interface SetRoomPanelProps {
  deviceName: string;
  currentRoom: string | undefined;
  choices: string[];
  onSave: (room: string) => void;
  onBack: () => void;
}

/** Free-text room entry with one-tap suggestions; saving an empty name takes the device out of its room. */
export function SetRoomPanel({ deviceName, currentRoom, choices, onSave, onBack }: SetRoomPanelProps) {
  const [text, setText] = useState(currentRoom ?? "");
  const cleaned = cleanRoomName(text);
  return (
    <>
      <Text style={modal.title}>{`Room for ${deviceName}`}</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="For example, Living Room"
        placeholderTextColor={theme.textTertiary}
        maxLength={MAX_ROOM_NAME_LENGTH}
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={() => onSave(cleaned)}
        accessibilityLabel="Room name"
      />
      <View style={styles.chips}>
        {choices.map((name) => (
          <Pressable key={name} style={[styles.chip, cleaned.toLowerCase() === name.toLowerCase() && styles.chipActive]} onPress={() => setText(name)} accessibilityRole="button" accessibilityLabel={`Use ${name}`}>
            <Text style={styles.chipLabel}>{name}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={({ pressed }) => [modal.option, pressed && modal.optionPressed]} onPress={() => onSave(cleaned)} accessibilityRole="button">
        <Text style={modal.optionLabel}>{cleaned ? "Save room" : currentRoom ? "Remove from room" : "Save room"}</Text>
      </Pressable>
      <Pressable style={modal.cancel} onPress={onBack}>
        <Text style={modal.cancelLabel}>Back</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    color: theme.textPrimary,
    fontSize: theme.type.body,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  chip: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: theme.spacing.xs + 2,
    paddingHorizontal: theme.spacing.md,
  },
  chipActive: { borderColor: theme.accentEnd, backgroundColor: theme.accentSoft },
  chipLabel: { color: theme.textPrimary, fontSize: theme.type.label, fontWeight: "600" },
});
