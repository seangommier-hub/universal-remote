import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommandEngine } from "../core/engine/CommandEngine";
import { StateStore } from "../core/state/StateStore";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { DeviceState } from "../core/types/DeviceState";
import { AddSquirrelFeederDeviceScreen } from "./AddSquirrelFeederDeviceScreen";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface FeederTabScreenProps {
  devices: Device[];
  driverRegistry: DriverRegistry;
  stateStore: StateStore;
  commandEngine: CommandEngine;
  onAdded: (device: Device) => void;
  onReconnect: (device: Device) => Promise<void>;
  onRemove: (device: Device) => Promise<void>;
}

const FEEDER_STATE_LABEL: Record<string, string> = {
  IDLE: "Idle",
  VALIDATING: "Validating",
  DISPENSING: "Dispensing",
  COOLDOWN: "Cooldown",
};

/** ms since the ESP32's own boot -> "2h 14m", "45s". Not a wall-clock timestamp (see network.cpp's millis()-based fields), so this is a duration formatter, not a date formatter. */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** `last_detection`/`last_dispense` are 0 until the first one happens since boot (sensor.h/feeder.cpp) — everything else is "that long before now", derived from the feeder's own uptime rather than wall-clock time since neither field is an epoch timestamp. */
function formatSinceBoot(uptimeMs: number, eventMs: number): string {
  if (eventMs === 0) return "Never (since boot)";
  return `${formatDuration(Math.max(0, uptimeMs - eventMs))} ago`;
}

/** Top-level "Feeder" tab (ADR-HEARTH-104): the feeder doesn't fit the remote-control device-list metaphor (no directional nav, no volume, just a status view and one action), so it gets its own tab and its own self-contained add-device flow rather than joining the Devices tab's "+ Add" picker. Supports exactly one feeder device — the ESP32 project itself is a single physical unit. */
export function FeederTabScreen({ devices, driverRegistry, stateStore, commandEngine, onAdded, onReconnect, onRemove }: FeederTabScreenProps) {
  const device = devices.find((d) => d.category === "feeder");

  if (!device) {
    return <AddSquirrelFeederDeviceScreen driverRegistry={driverRegistry} onAdded={onAdded} />;
  }

  return <FeederStatusView device={device} stateStore={stateStore} commandEngine={commandEngine} onReconnect={onReconnect} onRemove={onRemove} />;
}

interface FeederStatusViewProps {
  device: Device;
  stateStore: StateStore;
  commandEngine: CommandEngine;
  onReconnect: (device: Device) => Promise<void>;
  onRemove: (device: Device) => Promise<void>;
}

function FeederStatusView({ device, stateStore, commandEngine, onReconnect, onRemove }: FeederStatusViewProps) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<DeviceState>(() => stateStore.get(device.id));
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState("");
  const [dispensing, setDispensing] = useState(false);
  const [dispenseMessage, setDispenseMessage] = useState<{ text: string; isError: boolean } | null>(null);

  async function handleReconnectPress() {
    setReconnecting(true);
    setReconnectError("");
    try {
      await onReconnect(device);
    } catch (err) {
      setReconnectError(err instanceof Error ? err.message : String(err));
    } finally {
      setReconnecting(false);
    }
  }

  // Same "try immediately, don't make the user notice and tap Reconnect" reasoning as
  // LightControlScreen/UniversalTvRemote's identical effect.
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

  async function handleDispense() {
    setDispensing(true);
    setDispenseMessage(null);
    const result = await commandEngine.execute({ deviceId: device.id, capability: "dispense" });
    setDispensing(false);
    if (result.success) {
      setDispenseMessage({ text: "Dispense requested!", isError: false });
    } else {
      // A 429 "busy" response lands here as a normal, non-connection-breaking failure
      // (SquirrelFeederDriver.ts) — shown inline rather than as a reconnect prompt.
      setDispenseMessage({ text: result.error?.message ?? "Couldn't dispense", isError: true });
    }
  }

  function confirmRemove() {
    Alert.alert("Remove feeder?", `${device.name} will be unpaired from Hearth. You can add it again later.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => onRemove(device) },
    ]);
  }

  const isConnected = state.connection === "connected";
  const feederState = typeof state.values.feederState === "string" ? state.values.feederState : undefined;
  const isIdle = feederState === "IDLE";
  const cooldownActive = state.values.cooldownActive === true;
  const detections = typeof state.values.detections === "number" ? state.values.detections : 0;
  const dispenses = typeof state.values.dispenses === "number" ? state.values.dispenses : 0;
  const uptime = typeof state.values.uptime === "number" ? state.values.uptime : 0;
  const lastDetection = typeof state.values.lastDetection === "number" ? state.values.lastDetection : 0;
  const lastDispense = typeof state.values.lastDispense === "number" ? state.values.lastDispense : 0;
  const wifiRssi = typeof state.values.wifiRssi === "number" ? state.values.wifiRssi : undefined;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]}>
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="paw" size={20} color={theme.accentEnd} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              {device.name}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {device.manufacturer}
            </Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusPill, isConnected ? styles.statusPillOn : styles.statusPillOff]}>
            <View style={[styles.statusDot, { backgroundColor: isConnected ? theme.statusOn : theme.statusOff }]} />
            <Text style={styles.statusPillText}>{isConnected ? "Connected" : state.connection}</Text>
          </View>
          {feederState && (
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{FEEDER_STATE_LABEL[feederState] ?? feederState}</Text>
            </View>
          )}
          {wifiRssi !== undefined && (
            <View style={styles.statusPill}>
              <Ionicons name="wifi-outline" size={12} color={theme.textSecondary} />
              <Text style={styles.statusPillText}>{wifiRssi} dBm</Text>
            </View>
          )}
        </View>

        {!isConnected && (
          <View style={styles.reconnectCard}>
            <Text style={styles.reconnectText}>{reconnectError || "Not connected"}</Text>
            <CapabilityButton label={reconnecting ? "Reconnecting..." : "Reconnect"} variant="accent" onPress={handleReconnectPress} disabled={reconnecting} />
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Dispense</Text>
          <CapabilityButton
            label={dispensing ? "Dispensing..." : "Dispense Now"}
            icon="restaurant-outline"
            variant="accent"
            onPress={handleDispense}
            disabled={!isConnected || dispensing || (feederState !== undefined && !isIdle)}
          />
          {cooldownActive && feederState !== "COOLDOWN" && <Text style={styles.hint}>Feeder is in cooldown.</Text>}
          {dispenseMessage && <Text style={dispenseMessage.isError ? styles.error : styles.success}>{dispenseMessage.text}</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Activity</Text>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Detections</Text>
            <Text style={styles.statValue}>{detections}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Dispenses</Text>
            <Text style={styles.statValue}>{dispenses}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Last detection</Text>
            <Text style={styles.statValue}>{formatSinceBoot(uptime, lastDetection)}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Last dispense</Text>
            <Text style={styles.statValue}>{formatSinceBoot(uptime, lastDispense)}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Uptime</Text>
            <Text style={styles.statValue}>{formatDuration(uptime)}</Text>
          </View>
        </View>

        <CapabilityButton label="Remove Feeder" variant="ghost" onPress={confirmRemove} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: theme.textPrimary, fontSize: theme.type.title, fontWeight: "700" },
  subtitle: { color: theme.textSecondary, fontSize: theme.type.label, marginTop: theme.spacing.xs },
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
  hint: { color: theme.textTertiary, fontSize: theme.type.caption },
  error: { color: theme.statusError, fontSize: theme.type.label },
  success: { color: theme.statusOn, fontSize: theme.type.label },
  statRow: { flexDirection: "row", justifyContent: "space-between" },
  statLabel: { color: theme.textSecondary, fontSize: theme.type.label },
  statValue: { color: theme.textPrimary, fontSize: theme.type.label, fontWeight: "600" },
});
