import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { confirmAndroidTvPairing, normalizePairingCode } from "../discovery/androidTvPairing";
import { getBrand } from "../discovery/brandRegistry";
import { describePairingFailure, pairingPromptFor } from "../discovery/pairingCopy";
import { AndroidTvClient, AndroidTvPairingStart } from "../drivers/tv/androidtv/AndroidTvClient";
import { ANDROID_TV_DRIVER_ID } from "../drivers/tv/androidtv/AndroidTvDriver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { PairingProgressCard } from "./PairingProgressCard";
import { theme } from "./theme";
import { usePairingSession } from "./usePairingSession";

interface AddAndroidTvDeviceScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  initialIpAddress?: string;
}

type Stage = "form" | "code" | "confirming";

const ANDROID_TV_BRAND = getBrand("androidtv");
const ANDROID_TV_PROMPT = pairingPromptFor("androidtv")!;
const PAIRING_CODE_LENGTH = 6;

/**
 * Pairs a Google TV / Android TV through Family Command Center's Android TV Remote v2 bridge: starting
 * pairing makes the TV itself show a 6-character code, this screen takes it back, and the Pi keeps
 * the resulting certificate. The confirmation is a time-boxed pairing session (ADR-HEARTH-155).
 */
export function AddAndroidTvDeviceScreen({ driverRegistry, onCancel, onAdded, initialIpAddress }: AddAndroidTvDeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [ipAddress, setIpAddress] = useState(initialIpAddress ?? "");
  const [stage, setStage] = useState<Stage>("form");
  const [startError, setStartError] = useState("");
  const [start, setStart] = useState<AndroidTvPairingStart | null>(null);
  const [code, setCode] = useState("");
  const [starting, setStarting] = useState(false);
  const pairing = usePairingSession();

  async function handleStartPairing() {
    if (ipAddress.trim().length === 0) return setStartError("Enter the TV's IP address first.");
    setStarting(true);
    setStartError("");
    pairing.cancel();
    try {
      setStart(await new AndroidTvClient().startPairing(ipAddress.trim()));
      setCode("");
      setStage("code");
    } catch (error) {
      setStage("form");
      setStartError(describePairingFailure("androidtv", ANDROID_TV_BRAND.label, error).message);
    } finally {
      setStarting(false);
    }
  }

  async function confirmCode(pairingStart: AndroidTvPairingStart, normalizedCode: string): Promise<Device> {
    const driver = driverRegistry.get(ANDROID_TV_DRIVER_ID);
    if (!driver) throw new Error("Google TV / Android TV driver is not registered in this build.");
    return confirmAndroidTvPairing({ client: new AndroidTvClient(), driver, start: pairingStart, code: normalizedCode, ipAddress: ipAddress.trim(), name });
  }

  function handleSubmitCode() {
    const normalizedCode = normalizePairingCode(code);
    if (!start || !normalizedCode) return;
    setStage("confirming");
    pairing.start<Device>({
      totalMs: ANDROID_TV_PROMPT.timeoutMs,
      run: () => confirmCode(start, normalizedCode),
      onDone: onAdded,
      discard: (device) => driverRegistry.get(ANDROID_TV_DRIVER_ID)?.disconnect(device).catch(() => {}),
    });
  }

  function handleCancelConfirming() {
    pairing.cancel();
    setStage("code");
  }

  const failure = pairing.state.phase === "failed" ? describePairingFailure("androidtv", ANDROID_TV_BRAND.label, pairing.state.error) : null;
  const codeReady = normalizePairingCode(code) !== null;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="tv-outline" size={20} color={theme.accentEnd} />
          </View>
          <Text style={styles.title} accessibilityRole="header">Add Google TV / Android TV</Text>
        </View>

        {stage === "form" && (
          <>
            <View style={styles.hintCard}>
              <Text style={styles.hint}>
                Pairing shows a 6-character code right on the TV's own screen — no Google account or password is needed here.
                Requires Family Command Center to already be paired. Works for Chromecast with Google TV, Nvidia Shield and Google TVs from Sony, TCL and Hisense.
              </Text>
            </View>
            <Text style={styles.label}>Name (optional)</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Living Room TV" placeholderTextColor={theme.textTertiary} accessibilityLabel="Device name" />
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

        {stage === "code" && (
          <>
            <View style={styles.hintCard}>
              <Text style={styles.hint} accessibilityRole="header">{ANDROID_TV_PROMPT.heading}</Text>
              <Text style={styles.hint}>{ANDROID_TV_PROMPT.instruction}</Text>
            </View>
            <Text style={styles.label}>Code</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              placeholder="A1B2C3"
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={PAIRING_CODE_LENGTH}
              autoFocus
              accessibilityLabel="Pairing code"
            />
            <View style={styles.row}>
              <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} />
              <CapabilityButton label="Finish Pairing" variant="accent" onPress={handleSubmitCode} disabled={!codeReady} />
            </View>
          </>
        )}

        {stage === "confirming" && (
          <PairingProgressCard
            state={pairing.state}
            prompt={{ ...ANDROID_TV_PROMPT, heading: "Confirming the code", instruction: "Hearth is checking the code with your TV." }}
            failure={failure}
            onRetry={handleStartPairing}
            onCancel={handleCancelConfirming}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
