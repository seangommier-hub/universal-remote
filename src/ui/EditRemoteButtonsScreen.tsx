import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { commandChoicesFor, commandStepFromChoice, StepChoice } from "../core/activities/activityChoices";
import { Activity } from "../core/types/Activity";
import { Device } from "../core/types/Device";
import { StateStore } from "../core/state/StateStore";
import { fetchRemoteButtonMap, HouseholdRemote, HouseholdRemotesError, RemoteButtonMap, RemoteButtonTarget, saveRemoteButtonMap } from "../discovery/householdRemotes";
import { CapabilityButton } from "./CapabilityButton";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { theme } from "./theme";

/** ADR-HEARTH-201: the physical button slots ADR-HEARTH-197 Section 5's Phase 1 layout describes
 * (power, vol+/-, mute, 4-way d-pad, selectPlayPause, back, home). These ids are just labeled
 * slots on the remote -- what each one DOES is entirely the mapping the owner picks below, not
 * anything the button id itself implies. */
const REMOTE_BUTTON_SLOTS: readonly { id: string; label: string }[] = [
  { id: "power", label: "Power" },
  { id: "volumeUp", label: "Volume Up" },
  { id: "volumeDown", label: "Volume Down" },
  { id: "mute", label: "Mute" },
  { id: "dpadUp", label: "D-pad Up" },
  { id: "dpadDown", label: "D-pad Down" },
  { id: "dpadLeft", label: "D-pad Left" },
  { id: "dpadRight", label: "D-pad Right" },
  { id: "center", label: "Center / Select" },
  { id: "back", label: "Back" },
  { id: "home", label: "Home" },
];

function describeAdminError(error: unknown): string {
  if (error instanceof HouseholdRemotesError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

function describeTarget(target: RemoteButtonTarget | undefined, devices: Device[], activities: Activity[]): string {
  if (!target) return "Not set";
  if (target.kind === "activity") return `Activity: ${activities.find((a) => a.id === target.activityId)?.name ?? "Unknown activity"}`;
  const deviceName = devices.find((d) => d.id === target.deviceId)?.name ?? "Unknown device";
  return `${deviceName}: ${target.capability}${target.args?.volume !== undefined ? ` ${target.args.volume}` : ""}`;
}

interface EditRemoteButtonsScreenProps {
  remote: HouseholdRemote;
  devices: Device[];
  activities: Activity[];
  stateStore: StateStore;
  onDone: () => void;
}

/**
 * Per-remote button editor (ADR-HEARTH-201): assigns each physical button slot to either a single
 * device command (reusing ActivityEditorScreen's own `commandChoicesFor`/`commandStepFromChoice`
 * picker, ADR-HEARTH-197 Section 4) or a whole existing Activity, then saves the full map at once
 * via the owner-only PUT mapping route. No new capability ids are introduced -- a button can only
 * ever be assigned something a device already declares, or an Activity that already exists.
 */
export function EditRemoteButtonsScreen({ remote, devices, activities, stateStore, onDone }: EditRemoteButtonsScreenProps) {
  const insets = useSafeAreaInsets();
  const [buttons, setButtons] = useState<RemoteButtonMap | null>(null);
  const [loadError, setLoadError] = useState("");
  const [expandedButtonId, setExpandedButtonId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchRemoteButtonMap(remote.id)
      .then((map) => {
        if (!cancelled) setButtons(map);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(describeAdminError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [remote.id]);

  const inputsOf = (deviceId: string) => stateStore.get(deviceId).values.inputs;
  const usableDevices = devices.filter((device) => commandChoicesFor(device, inputsOf(device.id)).length > 0);

  function assignCommand(buttonId: string, deviceId: string, choice: StepChoice) {
    const step = commandStepFromChoice(deviceId, choice);
    setButtons((current) => ({ ...(current ?? {}), [buttonId]: { kind: "command", deviceId, capability: step.capability, ...(step.args ? { args: step.args } : {}) } }));
    setExpandedButtonId(null);
  }

  function assignActivity(buttonId: string, activityId: string) {
    setButtons((current) => ({ ...(current ?? {}), [buttonId]: { kind: "activity", activityId } }));
    setExpandedButtonId(null);
  }

  function clearButton(buttonId: string) {
    setButtons((current) => {
      if (!current) return current;
      const { [buttonId]: _removed, ...rest } = current;
      return rest;
    });
    setExpandedButtonId(null);
  }

  async function handleSave() {
    if (!buttons) return;
    setSaving(true);
    setSaveError("");
    try {
      await saveRemoteButtonMap(remote.id, buttons);
      onDone();
    } catch (error) {
      setSaveError(describeAdminError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]}>
      <View style={styles.headerRow}>
        <View style={styles.iconBadge}>
          <Ionicons name="grid-outline" size={20} color={theme.accentEnd} />
        </View>
        <Text style={styles.title}>Edit buttons: {remote.name}</Text>
      </View>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>Assign each button to a device command or a whole Activity. No IR yet -- these targets are used once the remote itself can send a button press (ADR-HEARTH-197 Phase 2).</Text>
      </View>

      {loadError !== "" && (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
          <Text style={styles.error}>{loadError}</Text>
        </View>
      )}
      {buttons === null && loadError === "" && <ActivityIndicator color={theme.accentEnd} style={{ alignSelf: "flex-start", marginTop: theme.spacing.lg }} />}

      {buttons !== null &&
        REMOTE_BUTTON_SLOTS.map((slot) => (
          <View key={slot.id} style={{ gap: theme.spacing.xs, paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.borderSubtle }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm }}>
              <Text style={{ color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "600" }}>{slot.label}</Text>
              <CapabilityButton
                label={expandedButtonId === slot.id ? "Close" : "Assign"}
                icon="chevron-down-outline"
                variant="ghost"
                onPress={() => setExpandedButtonId((current) => (current === slot.id ? null : slot.id))}
              />
            </View>
            <Text style={{ color: theme.textTertiary, fontSize: theme.type.label }}>{describeTarget(buttons[slot.id], devices, activities)}</Text>

            {expandedButtonId === slot.id && (
              <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
                {buttons[slot.id] && <CapabilityButton label="Clear this button" icon="close-outline" variant="ghost" onPress={() => clearButton(slot.id)} />}
                {usableDevices.map((device) => (
                  <View key={device.id} style={{ gap: theme.spacing.xs }}>
                    <Text style={{ color: theme.textSecondary, fontSize: theme.type.label, fontWeight: "600" }}>{device.name}</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
                      {commandChoicesFor(device, inputsOf(device.id)).map((choice) => (
                        <CapabilityButton key={choice.key} label={choice.label} onPress={() => assignCommand(slot.id, device.id, choice)} />
                      ))}
                    </View>
                  </View>
                ))}
                {activities.length > 0 && (
                  <View style={{ gap: theme.spacing.xs }}>
                    <Text style={{ color: theme.textSecondary, fontSize: theme.type.label, fontWeight: "600" }}>Activities</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
                      {activities.map((activity) => (
                        <CapabilityButton key={activity.id} label={activity.name} onPress={() => assignActivity(slot.id, activity.id)} />
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        ))}

      {saveError !== "" && <Text style={styles.error}>{saveError}</Text>}
      <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
        <CapabilityButton label={saving ? "Saving..." : "Save"} variant="accent" onPress={handleSave} disabled={saving || buttons === null} />
        <CapabilityButton label="Cancel" variant="ghost" onPress={onDone} />
      </View>
    </ScrollView>
  );
}
