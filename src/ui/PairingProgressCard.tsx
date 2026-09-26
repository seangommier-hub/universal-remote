import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native";
import { PairingPrompt } from "../discovery/pairingCopy";
import { formatCountdown, PairingSessionState } from "../discovery/pairingSession";
import { NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { CapabilityButton } from "./CapabilityButton";
import { NetworkFailureNotice } from "./NetworkFailureNotice";
import { theme } from "./theme";

// ADR-HEARTH-155: the one "look at your TV" card every pairing screen shows while it waits, fails
// or succeeds — the brand's prompt, a live countdown that matches the driver's real timeout, an
// animated waiting indicator, a one-tap Try again and a Cancel.

const PULSE_DURATION_MS = 1100;
const PULSE_MAX_SCALE = 1.45;
const PULSE_MIN_OPACITY = 0.25;
const INDICATOR_SIZE = 44;
const PROGRESS_BAR_HEIGHT = 6;

export interface PairingFailureView {
  title: string;
  message: string;
  diagnosis?: NetworkFailureDiagnosis | null;
}

interface PairingProgressCardProps {
  state: PairingSessionState;
  prompt: PairingPrompt;
  failure?: PairingFailureView | null;
  onRetry: () => void;
  onCancel: () => void;
}

function PulsingIndicator({ active }: { active: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return undefined;
    let loop: Animated.CompositeAnimation | null = null;
    let disposed = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (disposed || reduce) return;
      loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: PULSE_DURATION_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }));
      loop.start();
    });
    return () => {
      disposed = true;
      loop?.stop();
      pulse.setValue(0);
    };
  }, [active, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, PULSE_MAX_SCALE] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [PULSE_MIN_OPACITY + 0.5, 0] });
  return (
    <View style={styles.indicatorBox} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.pulseRing, { transform: [{ scale }], opacity }]} />
      <View style={styles.indicatorCore}>
        <Ionicons name="tv-outline" size={20} color={theme.background} />
      </View>
    </View>
  );
}

function CountdownBar({ remainingMs, totalMs }: { remainingMs: number; totalMs: number }) {
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  return (
    <View style={styles.countdownBlock}>
      <Text style={styles.countdownText} accessibilityRole="timer" accessibilityLabel={`${Math.ceil(remainingMs / 1000)} seconds left`}>
        {formatCountdown(remainingMs)} left
      </Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${fraction * 100}%` }]} />
      </View>
    </View>
  );
}

function WaitingBody({ state, prompt, onCancel }: { state: Extract<PairingSessionState, { phase: "waiting" }>; prompt: PairingPrompt; onCancel: () => void }) {
  return (
    <>
      <View style={styles.headerRow}>
        <PulsingIndicator active />
        <View style={styles.headerText}>
          <Text style={styles.heading} accessibilityRole="header">{prompt.heading}</Text>
          <Text style={styles.instruction}>{prompt.instruction}</Text>
        </View>
      </View>
      {state.totalMs !== null && <CountdownBar remainingMs={state.remainingMs} totalMs={state.totalMs} />}
      <View style={styles.buttonRow}>
        <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </>
  );
}

function FailedBody({ failure, onRetry, onCancel }: { failure: PairingFailureView; onRetry: () => void; onCancel: () => void }) {
  return (
    <>
      <View style={styles.failureRow}>
        <Ionicons name="alert-circle-outline" size={20} color={theme.statusError} />
        <View style={styles.headerText}>
          <Text style={styles.failureTitle} accessibilityRole="header">{failure.title}</Text>
          <Text style={styles.instruction}>{failure.message}</Text>
        </View>
      </View>
      {failure.diagnosis && <NetworkFailureNotice diagnosis={failure.diagnosis} />}
      <View style={styles.buttonRow}>
        <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} />
        <CapabilityButton label="Try again" variant="accent" onPress={onRetry} />
      </View>
    </>
  );
}

/** The shared pairing card: waiting (prompt, countdown, Cancel), failed (plain message, Try again) or Connected!. */
export function PairingProgressCard({ state, prompt, failure, onRetry, onCancel }: PairingProgressCardProps) {
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      {state.phase === "waiting" && <WaitingBody state={state} prompt={prompt} onCancel={onCancel} />}
      {state.phase === "failed" && failure && <FailedBody failure={failure} onRetry={onRetry} onCancel={onCancel} />}
      {state.phase === "connected" && (
        <View style={styles.connectedRow} accessibilityLabel="Connected">
          <Ionicons name="checkmark-circle" size={28} color={theme.statusOn} />
          <Text style={styles.connectedText}>Connected!</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.accentEnd,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.lg },
  failureRow: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.md },
  headerText: { flex: 1, gap: theme.spacing.xs },
  heading: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700" },
  failureTitle: { color: theme.statusError, fontSize: theme.type.subtitle, fontWeight: "700" },
  instruction: { color: theme.textSecondary, fontSize: theme.type.body, lineHeight: 21 },
  indicatorBox: { width: INDICATOR_SIZE * PULSE_MAX_SCALE, height: INDICATOR_SIZE * PULSE_MAX_SCALE, alignItems: "center", justifyContent: "center" },
  pulseRing: { position: "absolute", width: INDICATOR_SIZE, height: INDICATOR_SIZE, borderRadius: INDICATOR_SIZE / 2, backgroundColor: theme.accentEnd },
  indicatorCore: { width: INDICATOR_SIZE, height: INDICATOR_SIZE, borderRadius: INDICATOR_SIZE / 2, backgroundColor: theme.accentEnd, alignItems: "center", justifyContent: "center" },
  countdownBlock: { gap: theme.spacing.xs },
  countdownText: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "600" },
  progressTrack: { height: PROGRESS_BAR_HEIGHT, borderRadius: PROGRESS_BAR_HEIGHT / 2, backgroundColor: theme.border, overflow: "hidden" },
  progressFill: { height: PROGRESS_BAR_HEIGHT, backgroundColor: theme.accentEnd },
  buttonRow: { flexDirection: "row", gap: theme.spacing.md, justifyContent: "flex-end" },
  connectedRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, justifyContent: "center", paddingVertical: theme.spacing.md },
  connectedText: { color: theme.statusOn, fontSize: theme.type.subtitle, fontWeight: "700" },
});
