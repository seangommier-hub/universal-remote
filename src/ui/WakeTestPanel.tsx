import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CommandEngine } from "../core/engine/CommandEngine";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { wakeFailureMessage } from "../discovery/brandSetupChecks";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";
import { createWakeTestDependencies, describeWakeResult, WakeTestPhase, WakeTestRunner } from "./WakeTestRunner";

interface WakeTestPanelProps {
  device: Device;
  commandEngine: CommandEngine;
  stateStore: StateStore;
  /** Called once with the seconds it took when a test succeeds. */
  onWoke: (seconds: number) => void;
  /** Asks the parent to open the brand's settings checklist ("Show me how"). */
  onShowMeHow: () => void;
}

function headline(phase: WakeTestPhase, deviceName: string): string {
  if (phase.kind === "waiting") return `Waiting for ${deviceName}… ${phase.remainingSeconds} s left`;
  return describeWakeResult(phase);
}

/** Guided "turn it off, then tap Test wake" check with a live countdown and a brand-specific reason on failure. */
export function WakeTestPanel({ device, commandEngine, stateStore, onWoke, onShowMeHow }: WakeTestPanelProps) {
  const [phase, setPhase] = useState<WakeTestPhase>({ kind: "idle" });
  const onWokeRef = useRef(onWoke);
  onWokeRef.current = onWoke;
  const runner = useMemo(
    () =>
      new WakeTestRunner(createWakeTestDependencies(device, commandEngine, stateStore), (next) => {
        setPhase(next);
        if (next.kind === "success") onWokeRef.current(next.seconds);
      }),
    [device, commandEngine, stateStore]
  );
  useEffect(() => () => runner.dispose(), [runner]);

  const running = phase.kind === "waiting";
  const failed = phase.kind === "timeout";
  const message = failed ? wakeFailureMessage(device) : headline(phase, device.name);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Test wake</Text>
      <Text style={styles.instruction}>Turn {device.name} off with its own remote, then tap Test wake.</Text>
      {message.length > 0 && (
        <Text
          style={[styles.result, phase.kind === "success" && styles.success, (failed || phase.kind === "send-failed") && styles.failure]}
          accessibilityLiveRegion="polite"
        >
          {message}
        </Text>
      )}
      <View style={styles.row}>
        {running ? (
          <CapabilityButton label="Cancel" variant="ghost" onPress={() => runner.cancel()} />
        ) : (
          <CapabilityButton label={phase.kind === "idle" ? "Test wake" : "Test again"} variant="accent" onPress={() => void runner.start()} />
        )}
        {failed && <CapabilityButton label="Show me how" variant="default" onPress={onShowMeHow} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  title: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "700" },
  instruction: { color: theme.textSecondary, fontSize: theme.type.label, lineHeight: 18 },
  result: { color: theme.textPrimary, fontSize: theme.type.label, lineHeight: 18 },
  success: { color: theme.statusOn },
  failure: { color: theme.statusError },
  row: { flexDirection: "row", gap: theme.spacing.md, justifyContent: "center" },
});
