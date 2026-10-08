import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommandEngine } from "../core/engine/CommandEngine";
import { cleanRoomName, roomChoices, ROOM_SUGGESTIONS, roomKey } from "../core/layout/deviceLayout";
import { suggestRoom } from "../core/layout/suggestRoom";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { checksForDevice } from "../discovery/brandSetupChecks";
import { loadDeviceLayout } from "../runtime/deviceLayoutPersistence";
import { isShared } from "../runtime/sharedDevices";
import { CapabilityButton } from "./CapabilityButton";
import { PostAddChecklist } from "./PostAddChecklist";
import { theme } from "./theme";
import { WakeTestPanel } from "./WakeTestPanel";
import { recordWakeSuccess } from "./WakeTestStore";

export interface PostAddResult {
  name: string;
  shared: boolean;
  /** The room picked on this screen (ADR-HEARTH-221); empty when none was chosen. */
  room: string;
}

interface PostAddScreenProps {
  device: Device;
  /** "post-add" shows the name and sharing fields; "setup-checks" is the same wake checklist for an existing device. */
  mode: "post-add" | "setup-checks";
  commandEngine: CommandEngine;
  stateStore: StateStore;
  onDone: (result: PostAddResult) => void;
}

/** Shown right after a device is added (and from a device's long-press menu): name, sharing, and the "make it turn on from off" checklist plus wake test. */
export function PostAddScreen({ device, mode, commandEngine, stateStore, onDone }: PostAddScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(device.name);
  const [shared, setShared] = useState(isShared(device));
  const [showHow, setShowHow] = useState(false);
  // ADR-HEARTH-221: Home Assistant ends every add with "which area is it in?" -- offered here the
  // same way, with the room named in the device's own name (e.g. "Living Room TV") pre-selected.
  const [roomOptions, setRoomOptions] = useState<string[]>([...ROOM_SUGGESTIONS]);
  const [room, setRoom] = useState("");
  useEffect(() => {
    if (mode !== "post-add") return;
    let cancelled = false;
    loadDeviceLayout().then((layout) => {
      if (cancelled) return;
      const choices = roomChoices(layout);
      setRoomOptions(choices);
      setRoom((current) => current || suggestRoom(device.name, choices) || "");
    });
    return () => {
      cancelled = true;
    };
  }, [mode, device.name]);
  const checks = checksForDevice(device, Platform.OS);
  const isPostAdd = mode === "post-add";
  const finalName = name.trim().length > 0 ? name.trim() : device.name;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name={isPostAdd ? "checkmark-circle-outline" : "construct-outline"} size={22} color={theme.accentEnd} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {isPostAdd ? `${device.name} added` : `Setup checks for ${device.name}`}
          </Text>
        </View>

        {isPostAdd && (
          <>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={device.name}
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="words"
              returnKeyType="done"
              accessibilityLabel="Device name"
            />
            <Text style={styles.label}>Which room is it in?</Text>
            <View style={styles.chips}>
              {roomOptions.map((option) => {
                const selected = roomKey(room) === roomKey(option);
                return (
                  <Pressable
                    key={option}
                    style={[styles.chip, selected && styles.chipActive]}
                    onPress={() => setRoom(selected ? "" : option)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${option}${selected ? ", selected" : ""}`}
                  >
                    <Text style={styles.chipLabel}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.switchTitle}>Share with the household</Text>
                <Text style={styles.hint}>Other phones in your household get this device too.</Text>
              </View>
              <Switch value={shared} onValueChange={setShared} accessibilityLabel="Share with the household" />
            </View>
          </>
        )}

        {checks.length > 0 && (
          <>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Make it turn on from off
            </Text>
            <PostAddChecklist device={device} checks={checks} stateStore={stateStore} expandAll={showHow} />
            <WakeTestPanel
              device={device}
              commandEngine={commandEngine}
              stateStore={stateStore}
              onWoke={(seconds) => void recordWakeSuccess(device.id, seconds)}
              onShowMeHow={() => setShowHow(true)}
            />
          </>
        )}

        <View style={styles.doneRow}>
          <CapabilityButton
            label={isPostAdd ? "Done — open remote" : "Done"}
            variant="accent"
            onPress={() => onDone({ name: finalName, shared, room: cleanRoomName(room) })}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { padding: theme.spacing.xl, gap: theme.spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  iconBadge: { width: 40, height: 40, borderRadius: theme.radius.md, backgroundColor: theme.accentSoft, alignItems: "center", justifyContent: "center" },
  title: { color: theme.textPrimary, fontSize: theme.type.title, fontWeight: "700", flex: 1 },
  label: { color: theme.textSecondary, fontSize: theme.type.label, fontWeight: "600", marginTop: theme.spacing.sm },
  input: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    minHeight: 44,
    color: theme.textPrimary,
    fontSize: theme.type.body,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  chip: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.border,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.md,
  },
  chipActive: { borderColor: theme.accentEnd, backgroundColor: theme.accentSoft },
  chipLabel: { color: theme.textPrimary, fontSize: theme.type.label, fontWeight: "600" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, minHeight: 44, marginTop: theme.spacing.sm },
  switchText: { flex: 1, gap: 2 },
  switchTitle: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "600" },
  hint: { color: theme.textSecondary, fontSize: theme.type.label },
  sectionTitle: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700", marginTop: theme.spacing.lg },
  doneRow: { alignItems: "center", marginTop: theme.spacing.xl },
});
