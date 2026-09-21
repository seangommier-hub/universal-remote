import { Ionicons } from "@expo/vector-icons";
import { ComponentProps, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommandEngine } from "../core/engine/CommandEngine";
import { StateStore } from "../core/state/StateStore";
import { CapabilityId } from "../core/types/Capability";
import { Device } from "../core/types/Device";
import { DeviceState } from "../core/types/DeviceState";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";
import { useSwipeBackGesture } from "./useSwipeBackGesture";

interface VacuumControlScreenProps {
  device: Device;
  commandEngine: CommandEngine;
  stateStore: StateStore;
  onReconnect: () => Promise<void>;
  onRename: (device: Device, newName: string) => void;
  onBack: () => void;
}

type IconName = ComponentProps<typeof Ionicons>["name"];

// SwitchBot's own documented `workingStatus` values (see SwitchBotClient.ts) — mapped to a plain
// label/icon pair for display. Anything not in this map (a future value this driver hasn't seen)
// falls back to showing the raw string rather than hiding it.
const WORKING_STATUS_DISPLAY: Record<string, { label: string; icon: IconName }> = {
  StandBy: { label: "Standing by", icon: "pause-circle-outline" },
  Clearing: { label: "Cleaning", icon: "sync-outline" },
  Paused: { label: "Paused", icon: "pause-circle-outline" },
  GotoChargeBase: { label: "Returning to dock", icon: "return-down-back-outline" },
  Charging: { label: "Charging", icon: "battery-charging-outline" },
  ChargeDone: { label: "Fully charged", icon: "battery-full-outline" },
  Dormant: { label: "Idle", icon: "moon-outline" },
  InTrouble: { label: "Needs attention", icon: "alert-circle-outline" },
  InRemoteControl: { label: "Remote control", icon: "game-controller-outline" },
  InDustCollecting: { label: "Emptying bin", icon: "sync-outline" },
};

const SUCTION_LEVELS: { level: number; label: string }[] = [
  { level: 0, label: "Quiet" },
  { level: 1, label: "Standard" },
  { level: 2, label: "Strong" },
  { level: 3, label: "Max" },
];

function has(device: Device, capability: CapabilityId): boolean {
  return device.capabilities.includes(capability);
}

/**
 * One robot vacuum's controls (ADR-HEARTH-118) — Start/Stop/Dock plus a 4-level suction picker.
 * Not a scaled-down UniversalTvRemote, same reasoning as LightControlScreen: a vacuum's capability
 * set shares no real controls with a TV remote's.
 */
export function VacuumControlScreen({ device, commandEngine, stateStore, onReconnect, onRename, onBack }: VacuumControlScreenProps) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<DeviceState>(() => stateStore.get(device.id));
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(device.name);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState("");

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
    if (stateStore.get(device.id).connection !== "connected") {
      handleReconnectPress();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id]);

  useEffect(() => {
    setState(stateStore.get(device.id));
    return stateStore.subscribe(device.id, setState);
  }, [device.id, stateStore]);

  useEffect(() => {
    setEditingName(false);
    setNameInput(device.name);
  }, [device.id, device.name]);

  function commitNameEdit() {
    setEditingName(false);
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== device.name) {
      onRename(device, trimmed);
    } else {
      setNameInput(device.name);
    }
  }

  function send(capability: CapabilityId, args?: Record<string, unknown>) {
    commandEngine.execute({ deviceId: device.id, capability, args });
  }

  const isConnected = state.connection === "connected";
  const controlsDisabled = !isConnected;
  const battery = typeof state.values.battery === "number" ? state.values.battery : undefined;
  const workingStatus = typeof state.values.workingStatus === "string" ? state.values.workingStatus : undefined;
  const workingStatusDisplay = workingStatus ? WORKING_STATUS_DISPLAY[workingStatus] : undefined;

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
            <TextInput
              style={styles.deviceNameInput}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
              selectTextOnFocus
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={commitNameEdit}
              onBlur={commitNameEdit}
            />
          ) : (
            <Pressable style={styles.deviceNameRow} onPress={() => setEditingName(true)} accessibilityRole="button" accessibilityLabel={`Rename ${device.name}`}>
              <Text style={styles.deviceName} numberOfLines={1}>
                {device.name}
              </Text>
              <Ionicons name="pencil-outline" size={14} color={theme.textTertiary} />
            </Pressable>
          )}
          <Text style={styles.deviceMeta} numberOfLines={1}>
            {device.manufacturer}
          </Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.statusPill, isConnected ? styles.statusPillOn : styles.statusPillOff]}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? theme.statusOn : theme.statusOff }]} />
          <Text style={styles.statusPillText}>{isConnected ? "Connected" : state.connection}</Text>
        </View>
        {workingStatusDisplay && (
          <View style={styles.statusPill}>
            <Ionicons name={workingStatusDisplay.icon} size={14} color={theme.textSecondary} />
            <Text style={styles.statusPillText}>{workingStatusDisplay.label}</Text>
          </View>
        )}
        {battery !== undefined && (
          <View style={styles.statusPill}>
            <Ionicons name={battery <= 20 ? "battery-dead-outline" : "battery-half-outline"} size={14} color={theme.textSecondary} />
            <Text style={styles.statusPillText}>{battery}%</Text>
          </View>
        )}
      </View>

      {!isConnected && (
        <View style={styles.reconnectCard}>
          <Text style={styles.reconnectText}>{reconnectError || "Not connected"}</Text>
          <CapabilityButton label={reconnecting ? "Reconnecting..." : "Reconnect"} variant="accent" onPress={handleReconnectPress} disabled={reconnecting} />
        </View>
      )}

      {(has(device, "vacuumStart") || has(device, "vacuumStop") || has(device, "vacuumDock")) && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Controls</Text>
          <View style={styles.controlsRow}>
            {has(device, "vacuumStart") && (
              <CapabilityButton shape="circle" size="lg" icon="play" label="Start" variant="accent" onPress={() => send("vacuumStart")} disabled={controlsDisabled} />
            )}
            {has(device, "vacuumStop") && (
              <CapabilityButton shape="circle" icon="pause" label="Stop" onPress={() => send("vacuumStop")} disabled={controlsDisabled} />
            )}
            {has(device, "vacuumDock") && (
              <CapabilityButton shape="circle" icon="return-down-back-outline" label="Dock" onPress={() => send("vacuumDock")} disabled={controlsDisabled} />
            )}
          </View>
        </View>
      )}

      {has(device, "setSuctionPower") && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Suction Power</Text>
          <View style={styles.suctionRow}>
            {SUCTION_LEVELS.map((option) => (
              <CapabilityButton key={option.level} label={option.label} onPress={() => send("setSuctionPower", { level: option.level })} disabled={controlsDisabled} containerStyle={styles.suctionButton} />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm },
  headerDivider: { color: theme.textTertiary, fontSize: theme.type.subtitle },
  headerText: { flex: 1, minWidth: 0 },
  deviceNameRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, minWidth: 0 },
  deviceName: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700", flexShrink: 1 },
  deviceNameInput: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700", padding: 0 },
  deviceMeta: { color: theme.textTertiary, fontSize: theme.type.caption, marginTop: theme.spacing.xs },
  statusRow: { flexDirection: "row", gap: theme.spacing.sm, flexWrap: "wrap" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    backgroundColor: theme.surfaceRaised,
    borderRadius: theme.radius.full,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  statusPillOn: { backgroundColor: theme.statusOnSoft },
  statusPillOff: { backgroundColor: theme.surfaceRaised },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { color: theme.textSecondary, fontSize: theme.type.caption, fontWeight: "600" },
  reconnectCard: {
    backgroundColor: theme.statusErrorSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    alignItems: "center",
  },
  reconnectText: { color: theme.statusError, fontSize: theme.type.label, textAlign: "center" },
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  cardLabel: { color: theme.textSecondary, fontSize: theme.type.label, fontWeight: "600" },
  controlsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.spacing.lg },
  suctionRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  suctionButton: { flexBasis: "47%" },
});
