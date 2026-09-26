import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { getBrand } from "../discovery/brandRegistry";
import { describePairingFailure, pairingPromptFor } from "../discovery/pairingCopy";
import { pollPairingStatus } from "../discovery/pairingPoll";
import { PairingRunContext } from "../discovery/pairingSession";
import { APPLE_TV_PAIRING_POLL_INTERVAL_MS, APPLE_TV_PAIRING_POLL_MAX_ATTEMPTS, AppleTvClient } from "../drivers/tv/appletv/AppleTvClient";
import { APPLE_TV_DRIVER_ID } from "../drivers/tv/appletv/AppleTvDriver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { PairingProgressCard } from "./PairingProgressCard";
import { theme } from "./theme";
import { usePairingSession } from "./usePairingSession";

interface AddAppleTvDeviceScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  initialIpAddress?: string;
}

type Stage = "form" | "pin" | "confirming";

const APPLE_TV_BRAND = getBrand("appletv");
const APPLE_TV_PROMPT = pairingPromptFor("appletv")!;

/**
 * Pairs an Apple TV via Family Command Center's real local PIN handshake (AppleTvClient.ts) — no
 * browser step: starting pairing makes the Apple TV itself display a PIN, and this screen just
 * needs it typed back in. The confirmation wait is a time-boxed pairing session (ADR-HEARTH-155)
 * with a countdown, a plain-language error and a one-tap Try again that shows a fresh PIN.
 */
export function AddAppleTvDeviceScreen({ driverRegistry, onCancel, onAdded, initialIpAddress }: AddAppleTvDeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("Apple TV");
  const [ipAddress, setIpAddress] = useState(initialIpAddress ?? "");
  const [stage, setStage] = useState<Stage>("form");
  const [startError, setStartError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [starting, setStarting] = useState(false);
  const pairing = usePairingSession();

  async function handleStartPairing() {
    if (ipAddress.trim().length === 0) return setStartError("Enter the Apple TV's IP address first.");
    setStarting(true);
    setStartError("");
    pairing.cancel();
    try {
      const result = await new AppleTvClient().startPairing(ipAddress.trim());
      setSessionId(result.sessionId);
      setPin("");
      setStage("pin");
    } catch (error) {
      setStage("form");
      setStartError(describePairingFailure("appletv", APPLE_TV_BRAND.label, error).message);
    } finally {
      setStarting(false);
    }
  }

  async function confirmPin(id: string, context: PairingRunContext): Promise<Device> {
    const driver = driverRegistry.get(APPLE_TV_DRIVER_ID);
    if (!driver) throw new Error("Apple TV driver is not registered in this build.");
    const client = new AppleTvClient();
    await client.submitPin(id, pin.trim());
    await pollPairingStatus({
      fetchStatus: () => client.getPairingStatus(id),
      target: "success",
      intervalMs: APPLE_TV_PAIRING_POLL_INTERVAL_MS,
      maxAttempts: APPLE_TV_PAIRING_POLL_MAX_ATTEMPTS,
      context,
      fallbackErrorMessage: "Pairing failed on Family Command Center",
    });
    const device: Device = {
      id: `appletv-${Date.now()}`,
      name: name.trim() || "Apple TV",
      category: "streaming",
      manufacturer: "Apple",
      driverId: APPLE_TV_DRIVER_ID,
      capabilities: driver.getCapabilities(),
      config: { ipAddress: ipAddress.trim() },
    };
    await driver.connect(device);
    return device;
  }

  function handleSubmitPin() {
    if (!sessionId || pin.trim().length === 0) return;
    setStage("confirming");
    pairing.start<Device>({
      totalMs: APPLE_TV_PROMPT.timeoutMs,
      run: (context) => confirmPin(sessionId, context),
      onDone: onAdded,
      discard: (device) => driverRegistry.get(APPLE_TV_DRIVER_ID)?.disconnect(device).catch(() => {}),
    });
  }

  function handleCancelConfirming() {
    pairing.cancel();
    setStage("pin");
  }

  const failure = pairing.state.phase === "failed" ? describePairingFailure("appletv", APPLE_TV_BRAND.label, pairing.state.error) : null;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="tv-outline" size={20} color={theme.accentEnd} />
          </View>
          <Text style={styles.title} accessibilityRole="header">Add Apple TV</Text>
        </View>

        {stage === "form" && (
          <>
            <View style={styles.hintCard}>
              <Text style={styles.hint}>
                Pairing shows a PIN right on the Apple TV's own screen — no Apple ID or password is ever needed here.
                Requires Family Command Center to already be paired (Settings → the link icon on the home screen).
              </Text>
            </View>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Apple TV" placeholderTextColor={theme.textTertiary} accessibilityLabel="Device name" />
            <Text style={styles.label}>IP address</Text>
            <TextInput
              style={styles.input}
              value={ipAddress}
              onChangeText={setIpAddress}
              placeholder="192.168.1.90"
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="IP address"
            />
            {startError.length > 0 && (
              <View style={styles.errorCard}>
                <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
                <Text style={styles.error}>{startError}</Text>
              </View>
            )}
            <View style={styles.row}>
              <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={starting} />
              <CapabilityButton label={starting ? "Starting..." : "Pair"} variant="accent" onPress={handleStartPairing} disabled={starting} />
            </View>
          </>
        )}

        {stage === "pin" && (
          <>
            <View style={styles.hintCard}>
              <Text style={styles.hint} accessibilityRole="header">{APPLE_TV_PROMPT.heading}</Text>
              <Text style={styles.hint}>{APPLE_TV_PROMPT.instruction}</Text>
            </View>
            <Text style={styles.label}>PIN</Text>
            <TextInput
              style={styles.input}
              value={pin}
              onChangeText={setPin}
              placeholder="1234"
              placeholderTextColor={theme.textTertiary}
              keyboardType="number-pad"
              autoFocus
              accessibilityLabel="Apple TV PIN"
            />
            <View style={styles.row}>
              <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} />
              <CapabilityButton label="Finish Pairing" variant="accent" onPress={handleSubmitPin} disabled={pin.trim().length === 0} />
            </View>
          </>
        )}

        {stage === "confirming" && (
          <PairingProgressCard
            state={pairing.state}
            prompt={{ ...APPLE_TV_PROMPT, heading: "Confirming the PIN", instruction: "Hearth is checking the PIN with your Apple TV." }}
            failure={failure}
            onRetry={handleStartPairing}
            onCancel={handleCancelConfirming}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
