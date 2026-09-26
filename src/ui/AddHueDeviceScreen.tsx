import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { HueBridgeClient } from "../drivers/lighting/hue/HueBridgeClient";
import { HUE_LIGHT_DRIVER_ID } from "../drivers/lighting/hue/HueLightDriver";
import { getBrand } from "../discovery/brandRegistry";
import { findMacByIp } from "../discovery/familyCommandCenterDeviceLookup";
import { pairHueWithPolling } from "../discovery/huePairing";
import { describePairingFailure, pairingPromptFor } from "../discovery/pairingCopy";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { PairingProgressCard } from "./PairingProgressCard";
import { theme } from "./theme";
import { usePairingSession } from "./usePairingSession";

interface AddHueDeviceScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  /** Pre-fills the bridge address when reached from a discovered row (ADR-HEARTH-148). */
  initialIpAddress?: string;
}

type Lights = Record<string, { name: string }>;

type Phase =
  | { name: "form" }
  | { name: "picking-light"; username: string; lights: Lights }
  | { name: "connecting" }
  | { name: "error"; message: string };

const HUE_BRAND = getBrand("hue");
const HUE_PROMPT = pairingPromptFor("hue")!;
const HUE_APP_NAME = "hearth#mobile-app";

/**
 * Pairs a Philips Hue bridge (ADR-HEARTH-032) — a two-step flow: (1) pair with the bridge itself
 * (a physical link-button press, producing a `username` API key good for every light on it), then
 * (2) pick which light this `Device` represents. Step 1 is a time-boxed pairing session
 * (ADR-HEARTH-155): a live countdown over the same ceiling the poll uses, Cancel that stops the
 * polling at once, and a plain-language error with Try again.
 */
export function AddHueDeviceScreen({ driverRegistry, onCancel, onAdded, initialIpAddress }: AddHueDeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [bridgeIpAddress, setBridgeIpAddress] = useState(initialIpAddress ?? "");
  const [phase, setPhase] = useState<Phase>({ name: "form" });
  const pairing = usePairingSession();

  function handlePair() {
    const client = new HueBridgeClient({ bridgeIpAddress: bridgeIpAddress.trim() });
    pairing.start<{ username: string; lights: Lights }>({
      totalMs: HUE_PROMPT.timeoutMs,
      run: async (context) => {
        const username = await pairHueWithPolling({ pair: () => client.pair(HUE_APP_NAME), onWaitingForButton: () => {}, isCancelled: context.isCancelled, sleep: context.sleep });
        return { username, lights: await client.listLights(username) };
      },
      onDone: ({ username, lights }) => setPhase({ name: "picking-light", username, lights }),
    });
  }

  async function handleSelectLight(username: string, lightId: string, lightName: string) {
    const driver = driverRegistry.get(HUE_LIGHT_DRIVER_ID);
    if (!driver) {
      setPhase({ name: "error", message: "Hue driver is not registered in this build." });
      return;
    }

    const device: Device = {
      id: `hue-${lightId}-${Date.now()}`,
      name: lightName,
      category: "lighting",
      manufacturer: "Philips",
      driverId: HUE_LIGHT_DRIVER_ID,
      capabilities: driver.getCapabilities(),
      config: { bridgeIpAddress: bridgeIpAddress.trim(), username, lightId },
    };

    setPhase({ name: "connecting" });
    try {
      await driver.connect(device);
      // Real-hardware finding (2026-09-10, ADR-HEARTH-017): a hwaddr on file lets the driver
      // re-locate this bridge automatically if it ever moves to a different WiFi network — best
      // backfilled right at pairing time. Best-effort: a bridge the Family Command Center doesn't
      // know about yet just doesn't get this.
      const hwaddr = await findMacByIp(bridgeIpAddress.trim());
      if (hwaddr) device.config = { ...device.config, hwaddr };
      onAdded(device);
    } catch (err) {
      setPhase({ name: "error", message: describePairingFailure("hue", HUE_BRAND.label, err).message });
    }
  }

  const sessionPhase = pairing.state.phase;
  const showCard = phase.name === "form" && (sessionPhase === "waiting" || sessionPhase === "connected" || sessionPhase === "failed");
  const failure = pairing.state.phase === "failed" ? describePairingFailure("hue", HUE_BRAND.label, pairing.state.error) : null;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="bulb-outline" size={20} color={theme.accentEnd} />
          </View>
          <Text style={styles.title} accessibilityRole="header">Add Philips Hue</Text>
        </View>
        <View style={styles.hintCard}>
          <Text style={styles.hint}>
            Find your bridge's IP address in the Hue app (Settings → My Bridge), then tap Pair and press the round
            button on top of the bridge.
          </Text>
        </View>

        <Text style={styles.label}>Bridge IP address</Text>
        <TextInput
          style={styles.input}
          value={bridgeIpAddress}
          onChangeText={setBridgeIpAddress}
          placeholder="192.168.1.50"
          placeholderTextColor={theme.textTertiary}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          editable={phase.name === "form" && sessionPhase !== "waiting"}
          accessibilityLabel="Bridge IP address"
        />

        {showCard && <PairingProgressCard state={pairing.state} prompt={HUE_PROMPT} failure={failure} onRetry={pairing.retry} onCancel={pairing.cancel} />}

        {phase.name === "error" && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
            <Text style={styles.error}>{phase.message}</Text>
          </View>
        )}

        {phase.name === "picking-light" && (
          <View style={hueStyles.lightList}>
            <Text style={styles.label}>Choose a light</Text>
            {Object.entries(phase.lights).map(([lightId, light]) => (
              <CapabilityButton key={lightId} label={light.name} onPress={() => handleSelectLight(phase.username, lightId, light.name)} containerStyle={hueStyles.lightButton} />
            ))}
            {Object.keys(phase.lights).length === 0 && <Text style={styles.hint}>No lights found on this bridge yet.</Text>}
          </View>
        )}

        {!showCard && (
          <View style={styles.row}>
            <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={phase.name === "connecting"} />
            {phase.name !== "picking-light" && (
              <CapabilityButton
                label="Pair"
                variant="accent"
                onPress={() => {
                  setPhase({ name: "form" });
                  handlePair();
                }}
                disabled={bridgeIpAddress.trim().length === 0 || phase.name === "connecting"}
              />
            )}
          </View>
        )}
        {phase.name === "connecting" && <ActivityIndicator color={theme.accentEnd} style={styles.spinner} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const hueStyles = StyleSheet.create({
  lightList: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  lightButton: { width: "100%" },
});
