import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { StateStore } from "../core/state/StateStore";
import { DeviceState } from "../core/types/DeviceState";
import { describeDeviceStatus } from "./describeDeviceStatus";
import { theme } from "./theme";
import { useConnectivityMode } from "./useConnectivityMode";

const MS_PER_SECOND = 1000;

/** A device row's live status dot and plain-language line (ADR-HEARTH-163); subscribes per row so one device's change does not re-render the list. */
export function DeviceConnectionStatus({ stateStore, deviceId }: { stateStore: StateStore; deviceId: string }) {
  const [state, setState] = useState<DeviceState>(() => stateStore.get(deviceId));
  const connectivityMode = useConnectivityMode();

  useEffect(() => {
    setState(stateStore.get(deviceId));
    return stateStore.subscribe(deviceId, setState);
  }, [stateStore, deviceId]);

  const label = describeDeviceStatus({
    connection: state.connection,
    wakeBurstActive: false,
    connectivityMode,
    fccReachable: connectivityMode === "unknown" ? undefined : true,
    secondsSinceLastSeen: Math.max(0, Math.round((Date.now() - state.lastUpdated) / MS_PER_SECOND)),
  });
  const color = state.connection === "connected" ? theme.statusOn : state.connection === "disconnected" ? theme.statusError : theme.statusOff;

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  dot: { width: 7, height: 7, borderRadius: theme.radius.full },
  label: { color: theme.textTertiary, fontSize: theme.type.caption, flexShrink: 1 },
});
