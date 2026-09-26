import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { ConnectionState } from "../core/types/DeviceState";
import { SetupCheck } from "../discovery/brandSetupChecks";
import { evaluateAutoCheck, FccProbe, probeFamilyCommandCenter } from "./PostAddAutoChecks";
import { theme } from "./theme";

interface PostAddChecklistProps {
  device: Device;
  checks: SetupCheck[];
  stateStore: StateStore;
  /** Show every check's where-to-find text without tapping (after a failed wake test). */
  expandAll: boolean;
}

const MIN_HIT_TARGET = 44;

function useConnection(device: Device, stateStore: StateStore): ConnectionState {
  const [connection, setConnection] = useState<ConnectionState>(stateStore.get(device.id).connection);
  useEffect(() => stateStore.subscribe(device.id, (state) => setConnection(state.connection)), [device.id, stateStore]);
  return connection;
}

function useFccProbe(needed: boolean): FccProbe {
  const [probe, setProbe] = useState<FccProbe>("pending");
  useEffect(() => {
    if (!needed) return;
    let cancelled = false;
    void probeFamilyCommandCenter().then((result) => !cancelled && setProbe(result));
    return () => {
      cancelled = true;
    };
  }, [needed]);
  return probe;
}

function AutoRow({ check, device, fcc, connection }: { check: SetupCheck; device: Device; fcc: FccProbe; connection: ConnectionState }) {
  const result = check.auto ? evaluateAutoCheck(check.auto, { device, fcc, connection }) : null;
  const icon = result === null ? "time-outline" : result.ok ? "checkmark-circle" : "close-circle";
  const color = result === null ? theme.textTertiary : result.ok ? theme.statusOn : theme.statusError;
  const status = result === null ? "Checking" : result.ok ? "Passed" : "Needs attention";
  return (
    <View style={styles.row} accessible accessibilityLabel={`${check.title}. ${status}. ${result?.reason ?? ""}`}>
      <Ionicons name={icon} size={24} color={color} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{check.title}</Text>
        <Text style={[styles.rowWhy, result && !result.ok && styles.failure]}>{result?.reason ?? "Checking…"}</Text>
        {result && !result.ok && <Text style={styles.rowWhere}>{check.where}</Text>}
      </View>
    </View>
  );
}

function ManualRow({ check, checked, expanded, onToggle }: { check: SetupCheck; checked: boolean; expanded: boolean; onToggle: () => void }) {
  return (
    <Pressable
      style={styles.row}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={check.title}
      accessibilityHint={`${check.why} ${check.where}`}
    >
      <Ionicons name={checked ? "checkbox" : "square-outline"} size={24} color={checked ? theme.statusOn : theme.textSecondary} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{check.title}</Text>
        <Text style={styles.rowWhy}>{check.why}</Text>
        {(expanded || !checked) && <Text style={styles.rowWhere}>{check.where}</Text>}
      </View>
    </Pressable>
  );
}

/** The brand's "make it turn on from off" checks: automatic ones show a tick or cross, manual ones a tickbox. */
export function PostAddChecklist({ device, checks, stateStore, expandAll }: PostAddChecklistProps) {
  const connection = useConnection(device, stateStore);
  const fcc = useFccProbe(checks.some((check) => check.auto === "fcc-reachable"));
  const [ticked, setTicked] = useState<Record<string, boolean>>({});

  return (
    <View style={styles.list}>
      {checks.map((check) =>
        check.auto ? (
          <AutoRow key={check.id} check={check} device={device} fcc={fcc} connection={connection} />
        ) : (
          <ManualRow
            key={check.id}
            check={check}
            checked={ticked[check.id] === true}
            expanded={expandAll}
            onToggle={() => setTicked((current) => ({ ...current, [check.id]: !current[check.id] }))}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.xs },
  row: { flexDirection: "row", gap: theme.spacing.md, alignItems: "flex-start", minHeight: MIN_HIT_TARGET, paddingVertical: theme.spacing.sm },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "600" },
  rowWhy: { color: theme.textSecondary, fontSize: theme.type.label, lineHeight: 18 },
  rowWhere: { color: theme.textTertiary, fontSize: theme.type.caption, lineHeight: 16 },
  failure: { color: theme.statusError },
});
