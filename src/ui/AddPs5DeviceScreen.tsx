import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { logger } from "../core/logging/logger";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { getBrand } from "../discovery/brandRegistry";
import { describePairingFailure, pairingPromptFor } from "../discovery/pairingCopy";
import { pollPairingStatus } from "../discovery/pairingPoll";
import { PairingRunContext } from "../discovery/pairingSession";
import { PS5_PAIRING_POLL_INTERVAL_MS, PS5_PAIRING_POLL_MAX_ATTEMPTS, Ps5Client } from "../drivers/gaming/ps5/Ps5Client";
import { PS5_DRIVER_ID } from "../drivers/gaming/ps5/Ps5Driver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { PairingProgressCard } from "./PairingProgressCard";
import { Ps5SignInStep } from "./Ps5SignInStep";
import { theme } from "./theme";
import { usePairingSession } from "./usePairingSession";

interface AddPs5DeviceScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  initialIpAddress?: string;
}

type Stage = "form" | "signin" | "linking" | "pin" | "finishing";

const LOG_SCOPE = "AddPs5DeviceScreen";
const PS5_BRAND = getBrand("ps5");
const LINK_PROMPT = pairingPromptFor("ps5")!;
const PIN_PROMPT = pairingPromptFor("ps5-pin")!;
const PIN_LENGTH = 8;

/** Opens the PlayStation sign-in page in the in-app browser, falling back to the system browser. */
async function openSignInPage(loginUrl: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(loginUrl);
  } catch (error) {
    logger.warn(LOG_SCOPE, "In-app browser unavailable, using the system browser", { message: error instanceof Error ? error.message : String(error) });
    await Linking.openURL(loginUrl);
  }
}

/**
 * Pairs a PS5 through Family Command Center's PSN-login flow (Ps5Client.ts), cut down for
 * ADR-HEARTH-155 to: one "Sign in with PlayStation" button, one paste box that recognises the
 * pasted address by itself, and the console's 8-digit code. Nothing about the PSN password ever
 * passes through this screen or Family Command Center — that happens on Sony's own page.
 */
export function AddPs5DeviceScreen({ driverRegistry, onCancel, onAdded, initialIpAddress }: AddPs5DeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("PS5");
  const [ipAddress, setIpAddress] = useState(initialIpAddress ?? "");
  const [stage, setStage] = useState<Stage>("form");
  const [formError, setFormError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [starting, setStarting] = useState(false);
  const pairing = usePairingSession();

  async function handleSignIn() {
    if (ipAddress.trim().length === 0) return setFormError("Enter the PS5's IP address first.");
    setStarting(true);
    setFormError("");
    pairing.cancel();
    try {
      const { sessionId: id, loginUrl } = await new Ps5Client().startLogin(ipAddress.trim());
      setSessionId(id);
      setStage("signin");
      await openSignInPage(loginUrl);
    } catch (error) {
      setStage("form");
      setFormError(describePairingFailure("ps5", PS5_BRAND.label, error).message);
    } finally {
      setStarting(false);
    }
  }

  function pollFor(client: Ps5Client, id: string, target: "awaiting_pin" | "success", context: PairingRunContext): Promise<void> {
    return pollPairingStatus({
      fetchStatus: () => client.getLoginStatus(id),
      target,
      intervalMs: PS5_PAIRING_POLL_INTERVAL_MS,
      maxAttempts: PS5_PAIRING_POLL_MAX_ATTEMPTS,
      context,
      fallbackErrorMessage: "Pairing failed on Family Command Center",
    });
  }

  function handleRedirectFound(redirectUrl: string) {
    if (!sessionId || stage !== "signin") return;
    setStage("linking");
    pairing.start<void>({
      totalMs: LINK_PROMPT.timeoutMs,
      run: async (context) => {
        const client = new Ps5Client();
        await client.submitRedirectUrl(sessionId, redirectUrl);
        await pollFor(client, sessionId, "awaiting_pin", context);
      },
      onDone: () => setStage("pin"),
      connectedHoldMs: 0,
    });
  }

  async function finishPairing(id: string, code: string, context: PairingRunContext): Promise<Device> {
    const driver = driverRegistry.get(PS5_DRIVER_ID);
    if (!driver) throw new Error("PS5 driver is not registered in this build.");
    const client = new Ps5Client();
    await client.submitPin(id, code);
    await pollFor(client, id, "success", context);
    const device: Device = {
      id: `ps5-${Date.now()}`,
      name: name.trim() || "PS5",
      category: "gaming",
      manufacturer: "Sony",
      driverId: PS5_DRIVER_ID,
      capabilities: driver.getCapabilities(),
      config: { ipAddress: ipAddress.trim() },
    };
    await driver.connect(device);
    return device;
  }

  function submitPin(code: string) {
    if (!sessionId || code.trim().length === 0) return;
    setStage("finishing");
    pairing.start<Device>({
      totalMs: PIN_PROMPT.timeoutMs,
      run: (context) => finishPairing(sessionId, code.trim(), context),
      onDone: onAdded,
      discard: (device) => driverRegistry.get(PS5_DRIVER_ID)?.disconnect(device).catch(() => {}),
    });
  }

  function handlePinChange(text: string) {
    setPin(text);
    if (text.trim().length === PIN_LENGTH) submitPin(text);
  }

  function backTo(target: Stage) {
    pairing.cancel();
    setStage(target);
  }

  const failure = pairing.state.phase === "failed" ? describePairingFailure("ps5", PS5_BRAND.label, pairing.state.error) : null;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="game-controller-outline" size={20} color={theme.accentEnd} />
          </View>
          <Text style={styles.title} accessibilityRole="header">Add PS5</Text>
        </View>

        {stage === "form" && (
          <>
            <View style={styles.hintCard}>
              <Text style={styles.hint}>
                Power-on only. Pairing needs your PlayStation sign-in (never seen by this app; it happens on Sony's own
                page) and an 8-digit code from the console.
              </Text>
            </View>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="PS5" placeholderTextColor={theme.textTertiary} accessibilityLabel="Device name" />
            <Text style={styles.label}>IP address</Text>
            <TextInput
              style={styles.input}
              value={ipAddress}
              onChangeText={setIpAddress}
              placeholder="192.168.1.214"
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="IP address"
            />
            {formError.length > 0 && (
              <View style={styles.errorCard}>
                <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
                <Text style={styles.error}>{formError}</Text>
              </View>
            )}
            <View style={styles.row}>
              <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={starting} />
              <CapabilityButton label={starting ? "Starting..." : "Sign in with PlayStation"} variant="accent" onPress={handleSignIn} disabled={starting} />
            </View>
          </>
        )}

        {stage === "signin" && <Ps5SignInStep onOpenSignIn={handleSignIn} onRedirectFound={handleRedirectFound} onCancel={onCancel} disabled={starting} />}

        {stage === "linking" && (
          <PairingProgressCard state={pairing.state} prompt={LINK_PROMPT} failure={failure} onRetry={handleSignIn} onCancel={() => backTo("signin")} />
        )}

        {stage === "pin" && (
          <>
            <View style={styles.hintCard}>
              <Text style={styles.hint} accessibilityRole="header">{PIN_PROMPT.heading}</Text>
              <Text style={styles.hint}>{PIN_PROMPT.instruction}</Text>
            </View>
            <Text style={styles.label}>8-digit code</Text>
            <TextInput
              style={styles.input}
              value={pin}
              onChangeText={handlePinChange}
              placeholder="12345678"
              placeholderTextColor={theme.textTertiary}
              keyboardType="number-pad"
              maxLength={PIN_LENGTH}
              autoFocus
              accessibilityLabel="PS5 8-digit code"
            />
            <View style={styles.row}>
              <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} />
              <CapabilityButton label="Finish Pairing" variant="accent" onPress={() => submitPin(pin)} disabled={pin.trim().length === 0} />
            </View>
          </>
        )}

        {stage === "finishing" && (
          <PairingProgressCard state={pairing.state} prompt={PIN_PROMPT} failure={failure} onRetry={() => backTo("pin")} onCancel={() => backTo("pin")} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
