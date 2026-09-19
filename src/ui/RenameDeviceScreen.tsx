import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Device } from "../core/types/Device";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface RenameDeviceScreenProps {
  device: Device;
  onCancel: () => void;
  onSaved: (newName: string) => void;
}

/**
 * Rename already existed from inside a device's own remote screen (tap the header name) —
 * real-device feedback, 2026-09-10. This surfaces the same action from the device list's
 * long-press menu too, next to Edit address/Remove, since a rename entry point buried inside each
 * device's own remote screen isn't discoverable the way this project's other per-device actions
 * already are (ADR-HEARTH-085).
 */
export function RenameDeviceScreen({ device, onCancel, onSaved }: RenameDeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(device.name);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && trimmed !== device.name;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="pencil-outline" size={20} color={theme.accentEnd} />
          </View>
          <Text style={styles.title}>Rename {device.name}</Text>
        </View>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={device.name}
          placeholderTextColor={theme.textTertiary}
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={() => canSubmit && onSaved(trimmed)}
        />

        <View style={styles.row}>
          <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} />
          <CapabilityButton label="Save" variant="accent" onPress={() => onSaved(trimmed)} disabled={!canSubmit} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
