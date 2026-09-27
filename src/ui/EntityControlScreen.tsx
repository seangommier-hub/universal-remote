import { Ionicons } from "@expo/vector-icons";
import { ComponentType, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommandEngine } from "../core/engine/CommandEngine";
import { ConfirmationPrompt, confirmationFor } from "../core/engine/commandConfirmation";
import { StateStore } from "../core/state/StateStore";
import { CapabilityId } from "../core/types/Capability";
import { Device, DeviceCategory } from "../core/types/Device";
import { DeviceState } from "../core/types/DeviceState";
import { CapabilityButton } from "./CapabilityButton";
import { ActionControls } from "./entityControls/ActionControls";
import { AlarmControls } from "./entityControls/AlarmControls";
import { CameraControls } from "./entityControls/CameraControls";
import { ClimateControls } from "./entityControls/ClimateControls";
import { ConfirmCard } from "./entityControls/ConfirmCard";
import { CoverControls } from "./entityControls/CoverControls";
import { FanControls } from "./entityControls/FanControls";
import { LockControls } from "./entityControls/LockControls";
import { SensorTile } from "./entityControls/SensorTile";
import { EntityControlProps } from "./entityControls/entityControlTypes";
import { theme } from "./theme";
import { useSwipeBackGesture } from "./useSwipeBackGesture";

const TOAST_MS = 3500;

interface EntityControlScreenProps {
  device: Device;
  commandEngine: CommandEngine;
  stateStore: StateStore;
  onReconnect: () => Promise<void>;
  onRename: (device: Device, newName: string) => void;
  onBack: () => void;
}

/** Device categories drawn by this screen instead of the TV remote, light or vacuum screens (ADR-HEARTH-178; camera and alarm added by ADR-HEARTH-182). */
export const ENTITY_SCREEN_CATEGORIES: ReadonlySet<DeviceCategory> = new Set<DeviceCategory>(["cover", "lock", "climate", "fan", "sensor", "action", "camera", "alarm"]);

const CONTROLS: Partial<Record<DeviceCategory, ComponentType<EntityControlProps>>> = {
  cover: CoverControls,
  lock: LockControls,
  climate: ClimateControls,
  fan: FanControls,
  sensor: SensorTile,
  action: ActionControls,
  camera: CameraControls,
  alarm: AlarmControls,
};

interface Toast {
  ok: boolean;
  text: string;
}

interface PendingPress {
  capability: CapabilityId;
  args?: Record<string, unknown>;
  prompt: ConfirmationPrompt;
}

function availabilityText(state: DeviceState): string | null {
  if (state.values.availability === "unavailable") return "Home Assistant says this is unavailable.";
  return state.values.availability === "unknown" ? "Home Assistant has no value for this yet." : null;
}

/** The generic control screen for Home Assistant covers, locks, climate, fans, sensors and run-once actions (ADR-HEARTH-178). */
export function EntityControlScreen({ device, commandEngine, stateStore, onReconnect, onRename, onBack }: EntityControlScreenProps) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<DeviceState>(() => stateStore.get(device.id));
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(device.name);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState("");
  const [pending, setPending] = useState<PendingPress | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleReconnectPress() {
    setReconnecting(true);
    setReconnectError("");
    try {
      await onReconnect();
    } catch (err) {
      setReconnectError(err instanceof Error ? err.message : String(err));
    } finally {
      setReconnecting(false);
    }
  }

  useEffect(() => {
    if (stateStore.get(device.id).connection !== "connected") void handleReconnectPress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id]);

  useEffect(() => {
    setState(stateStore.get(device.id));
    return stateStore.subscribe(device.id, setState);
  }, [device.id, stateStore]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function showToast(next: Toast) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }

  async function execute(capability: CapabilityId, args?: Record<string, unknown>) {
    const result = await commandEngine.execute({ deviceId: device.id, capability, args });
    if (!result.success) showToast({ ok: false, text: result.error?.message ?? "That did not work." });
    else if (capability === "trigger") showToast({ ok: true, text: `Ran ${device.name}.` });
  }

  function press(capability: CapabilityId, args?: Record<string, unknown>) {
    const prompt = confirmationFor(device, capability, state.values);
    if (prompt) setPending({ capability, args, prompt });
    else void execute(capability, args);
  }

  function confirmPending() {
    if (!pending) return;
    const { capability, args } = pending;
    setPending(null);
    void execute(capability, args);
  }

  function commitNameEdit() {
    setEditingName(false);
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== device.name) onRename(device, trimmed);
    else setNameInput(device.name);
  }

  const isConnected = state.connection === "connected";
  const reported = availabilityText(state);
  const Controls = CONTROLS[device.category];
  const swipeBackHandlers = useSwipeBackGesture(onBack);

  return (
    <View style={styles.container} {...swipeBackHandlers}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to devices" hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerDivider}>|</Text>
          <View style={styles.headerText}>
            {editingName ? (
              <TextInput style={styles.deviceNameInput} value={nameInput} onChangeText={setNameInput} autoFocus selectTextOnFocus maxLength={40} returnKeyType="done" onSubmitEditing={commitNameEdit} onBlur={commitNameEdit} />
            ) : (
              <Pressable style={styles.deviceNameRow} onPress={() => setEditingName(true)} accessibilityRole="button" accessibilityLabel={`Rename ${device.name}`}>
                <Text style={styles.deviceName} numberOfLines={1}>{device.name}</Text>
                <Ionicons name="pencil-outline" size={14} color={theme.textTertiary} />
              </Pressable>
            )}
            <Text style={styles.deviceMeta} numberOfLines={1}>{device.manufacturer} {device.model}</Text>
          </View>
        </View>

        <View style={[styles.statusPill, isConnected ? styles.statusPillOn : styles.statusPillOff]}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? theme.statusOn : theme.statusOff }]} />
          <Text style={styles.statusPillText}>{isConnected ? "Connected" : reported ? (state.connection === "unknown" ? "Unknown" : "Unavailable") : state.connection}</Text>
        </View>

        {!isConnected && (
          <View style={styles.reconnectCard}>
            <Text style={styles.reconnectText}>{reported ?? (reconnectError || "Not connected")}</Text>
            {!reported && <CapabilityButton label={reconnecting ? "Reconnecting..." : "Reconnect"} variant="accent" onPress={handleReconnectPress} disabled={reconnecting} />}
          </View>
        )}

        {pending && <ConfirmCard prompt={pending.prompt} onConfirm={confirmPending} onCancel={() => setPending(null)} />}
        {toast && (
          <View style={[styles.toast, toast.ok ? styles.toastOk : styles.toastError]} accessibilityLiveRegion="polite">
            <Text style={styles.toastText}>{toast.text}</Text>
          </View>
        )}

        {Controls && <Controls device={device} state={state} disabled={!isConnected} onPress={press} fetchSnapshot={(deviceId) => commandEngine.fetchSnapshot(deviceId)} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm },
  headerDivider: { color: theme.textTertiary, fontSize: theme.type.subtitle },
  headerText: { flex: 1, minWidth: 0 },
  deviceNameRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, minWidth: 0 },
  deviceName: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700", flexShrink: 1 },
  deviceNameInput: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700", padding: 0 },
  deviceMeta: { color: theme.textTertiary, fontSize: theme.type.caption, marginTop: theme.spacing.xs },
  statusPill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: theme.spacing.xs, borderRadius: theme.radius.full, paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.md },
  statusPillOn: { backgroundColor: theme.statusOnSoft },
  statusPillOff: { backgroundColor: theme.surfaceRaised },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { color: theme.textSecondary, fontSize: theme.type.caption, fontWeight: "600" },
  reconnectCard: { backgroundColor: theme.statusErrorSoft, borderRadius: theme.radius.md, padding: theme.spacing.md, gap: theme.spacing.sm, alignItems: "center" },
  reconnectText: { color: theme.statusError, fontSize: theme.type.label, textAlign: "center" },
  toast: { borderRadius: theme.radius.md, padding: theme.spacing.md },
  toastOk: { backgroundColor: theme.statusOnSoft },
  toastError: { backgroundColor: theme.statusErrorSoft },
  toastText: { color: theme.textPrimary, fontSize: theme.type.label },
});
