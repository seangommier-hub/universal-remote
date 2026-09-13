import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StateStore } from "../core/state/StateStore";
import { CapabilityId, StreamingService } from "../core/types/Capability";
import { Device } from "../core/types/Device";
import { Scene, SceneAction } from "../core/types/Scene";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface CreateSceneScreenProps {
  devices: Device[];
  stateStore: StateStore;
  onCancel: () => void;
  onSaved: (scene: Scene) => void;
  /** When given, edits this existing scene in place (same id on save) instead of creating a new one. */
  editingScene?: Scene;
}

// Scene actions cover no-arg capabilities (ADR-HEARTH-056) plus inputSelection (ADR-HEARTH-059) and
// launchApp (ADR-HEARTH-061) — both have a small, already-known set of valid values (a device's own
// live input list; the fixed 4-service StreamingService enum every driver that supports launchApp
// already shares), so each only needed a picker, not a whole new per-capability config UI.
// setVolume, setBrightness, setColor, directionalNavigation, and setChannel still each need a kind
// of input that isn't just "pick from a short known list" (a number, a color, a direction) — not
// part of this pass. A device with none of these still simply has nothing to add here.
const NO_ARG_CAPABILITIES: ReadonlySet<CapabilityId> = new Set([
  "power",
  "powerOn",
  "powerOff",
  "volumeUp",
  "volumeDown",
  "mute",
  "channelUp",
  "channelDown",
  "select",
  "back",
  "home",
  "menu",
  "sleepTimer",
  "settings",
  "openSourceList",
  "playPause",
]);

const CAPABILITY_LABELS: Partial<Record<CapabilityId, string>> = {
  power: "Power",
  powerOn: "Power On",
  powerOff: "Power Off",
  volumeUp: "Volume Up",
  volumeDown: "Volume Down",
  mute: "Mute",
  channelUp: "Channel Up",
  channelDown: "Channel Down",
  select: "Select",
  back: "Back",
  home: "Home",
  menu: "Menu",
  sleepTimer: "Sleep Timer",
  settings: "Settings",
  openSourceList: "Source",
  playPause: "Play/Pause",
};

// Same 4 services every launchApp-capable driver maps to its own protocol's real app/channel id
// (see Capability.ts's StreamingService type and e.g. UniversalTvRemote.tsx's own STREAMING_APPS) —
// display labels here, not the brand wordmark styling that screen uses, since this is a plain list.
const STREAMING_SERVICE_LABELS: Record<StreamingService, string> = {
  netflix: "Netflix",
  hulu: "Hulu",
  primeVideo: "Prime Video",
  youtube: "YouTube",
};
const STREAMING_SERVICES = Object.keys(STREAMING_SERVICE_LABELS) as StreamingService[];

interface InputOption {
  id: string;
  label: string;
}

function isInputOptionArray(value: unknown): value is InputOption[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "object" && entry !== null && typeof (entry as InputOption).id === "string");
}

function actionKey(action: SceneAction): string {
  return `${action.deviceId}:${action.capability}`;
}

/** A scene action's display label — for inputSelection, resolves the chosen input's real label off the device's live state rather than showing the raw capability name. */
function describeAction(action: SceneAction, devices: Device[], stateStore: StateStore): string {
  const device = devices.find((d) => d.id === action.deviceId);
  const deviceName = device?.name ?? action.deviceId;
  if (action.capability === "inputSelection") {
    const inputs = stateStore.get(action.deviceId).values.inputs;
    const inputId = action.args?.input;
    const match = isInputOptionArray(inputs) ? inputs.find((option) => option.id === inputId) : undefined;
    return `${deviceName} — ${match?.label ?? String(inputId ?? "Input")}`;
  }
  if (action.capability === "launchApp") {
    const service = action.args?.service as StreamingService | undefined;
    return `${deviceName} — Launch ${(service && STREAMING_SERVICE_LABELS[service]) ?? String(service ?? "app")}`;
  }
  return `${deviceName} — ${CAPABILITY_LABELS[action.capability] ?? action.capability}`;
}

/**
 * Builds or edits a Scene: a name plus an ordered list of (device, capability, optional args)
 * actions, run in sequence when the scene is triggered from the home screen
 * (ADR-HEARTH-056/059/061). Tapping a capability chip under a device adds it to the scene; tapping
 * an already-added chip (or its entry in the summary list below) removes it. An input or
 * launch-app chip instead *replaces* any existing selection of that same kind for that device (a
 * scene can only switch a device to one input, or launch one app, not several) — tapping the
 * currently-selected one again removes it. Passing `editingScene` (ADR-HEARTH-058) pre-fills the
 * name and actions and saves back over the same id instead of creating a new scene.
 */
export function CreateSceneScreen({ devices, stateStore, onCancel, onSaved, editingScene }: CreateSceneScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(editingScene?.name ?? "");
  const [actions, setActions] = useState<SceneAction[]>(editingScene?.actions ?? []);
  const isEditing = editingScene !== undefined;

  function toggleAction(deviceId: string, capability: CapabilityId, args?: Record<string, unknown>) {
    setActions((current) => {
      const key = `${deviceId}:${capability}`;
      const existing = current.find((a) => actionKey(a) === key);
      const isSameSelection = existing !== undefined && JSON.stringify(existing.args) === JSON.stringify(args);
      const withoutExisting = current.filter((a) => actionKey(a) !== key);
      if (isSameSelection) return withoutExisting;
      return [...withoutExisting, { deviceId, capability, args }];
    });
  }

  function handleSave() {
    const scene: Scene = { id: editingScene?.id ?? `scene-${Date.now()}`, name: name.trim(), actions };
    onSaved(scene);
  }

  const canSave = name.trim().length > 0 && actions.length > 0;
  const relevantDevices = devices.filter((d) => {
    const hasNoArgCapability = d.capabilities.some((c) => NO_ARG_CAPABILITIES.has(c));
    const inputs = stateStore.get(d.id).values.inputs;
    const hasSelectableInputs = d.capabilities.includes("inputSelection") && isInputOptionArray(inputs) && inputs.length > 0;
    const hasLaunchApp = d.capabilities.includes("launchApp");
    return hasNoArgCapability || hasSelectableInputs || hasLaunchApp;
  });

  return (
    <View style={styles.container}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg, paddingBottom: theme.spacing.xxl }]}>
      <View style={styles.headerRow}>
        <View style={styles.iconBadge}>
          <Ionicons name="flash-outline" size={20} color={theme.accentEnd} />
        </View>
        <Text style={styles.title}>{isEditing ? "Edit Scene" : "New Scene"}</Text>
      </View>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>
          Pick one or more actions across your devices — they run in order when you tap this scene, e.g. "Movie Night" could
          power on the TV, switch to HDMI 1, and mute the receiver in one tap.
        </Text>
      </View>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Movie Night" placeholderTextColor={theme.textTertiary} />

      {relevantDevices.length === 0 && (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
          <Text style={styles.error}>No paired devices have an action scenes can use yet.</Text>
        </View>
      )}

      {relevantDevices.map((device) => {
        const inputs = stateStore.get(device.id).values.inputs;
        const inputOptions = isInputOptionArray(inputs) ? inputs : [];
        const selectedInput = actions.find((a) => a.deviceId === device.id && a.capability === "inputSelection")?.args?.input;
        const selectedService = actions.find((a) => a.deviceId === device.id && a.capability === "launchApp")?.args?.service;
        return (
          <View key={device.id} style={sceneStyles.deviceSection}>
            <Text style={sceneStyles.deviceName}>{device.name}</Text>
            <View style={sceneStyles.chipRow}>
              {device.capabilities
                .filter((capability) => NO_ARG_CAPABILITIES.has(capability))
                .map((capability) => {
                  const selected = actions.some((a) => a.deviceId === device.id && a.capability === capability);
                  return (
                    <CapabilityButton
                      key={capability}
                      label={CAPABILITY_LABELS[capability] ?? capability}
                      variant={selected ? "accent" : "default"}
                      onPress={() => toggleAction(device.id, capability)}
                    />
                  );
                })}
            </View>
            {inputOptions.length > 0 && (
              <>
                <Text style={sceneStyles.subLabel}>Switch input to:</Text>
                <View style={sceneStyles.chipRow}>
                  {inputOptions.map((option) => (
                    <CapabilityButton
                      key={option.id}
                      label={option.label}
                      variant={selectedInput === option.id ? "accent" : "default"}
                      onPress={() => toggleAction(device.id, "inputSelection", { input: option.id })}
                    />
                  ))}
                </View>
              </>
            )}
            {device.capabilities.includes("launchApp") && (
              <>
                <Text style={sceneStyles.subLabel}>Launch app:</Text>
                <View style={sceneStyles.chipRow}>
                  {STREAMING_SERVICES.map((service) => (
                    <CapabilityButton
                      key={service}
                      label={STREAMING_SERVICE_LABELS[service]}
                      variant={selectedService === service ? "accent" : "default"}
                      onPress={() => toggleAction(device.id, "launchApp", { service })}
                    />
                  ))}
                </View>
              </>
            )}
          </View>
        );
      })}

      {actions.length > 0 && (
        <View style={sceneStyles.summaryCard}>
          <Text style={styles.label}>This scene will run, in order:</Text>
          {actions.map((action) => (
            <View key={actionKey(action)} style={sceneStyles.summaryRow}>
              <Text style={sceneStyles.summaryText} numberOfLines={1}>
                {describeAction(action, devices, stateStore)}
              </Text>
              <Pressable
                onPress={() => toggleAction(action.deviceId, action.capability, action.args)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${describeAction(action, devices, stateStore)}`}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={styles.row}>
        <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} />
        <CapabilityButton label={isEditing ? "Save Changes" : "Save Scene"} variant="accent" onPress={handleSave} disabled={!canSave} />
      </View>
    </ScrollView>
    </View>
  );
}

const sceneStyles = {
  deviceSection: { marginTop: theme.spacing.lg, gap: theme.spacing.xs },
  deviceName: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "700" as const },
  subLabel: { color: theme.textTertiary, fontSize: theme.type.caption, marginTop: theme.spacing.xs },
  chipRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, columnGap: theme.spacing.sm, rowGap: theme.spacing.sm },
  summaryCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: theme.spacing.md,
    marginTop: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  summaryRow: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: theme.spacing.sm },
  summaryText: { color: theme.textSecondary, fontSize: theme.type.label, flex: 1 },
};
