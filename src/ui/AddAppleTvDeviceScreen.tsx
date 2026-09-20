import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { AppleTvClient } from "../drivers/tv/appletv/AppleTvClient";
import { APPLE_TV_DRIVER_ID } from "../drivers/tv/appletv/AppleTvDriver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface AddAppleTvDeviceScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  initialIpAddress?: string;
}

type Stage = "idle" | "pin" | "saving" | "error";

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 20; // ~30s

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pairs an Apple TV via Family Command Center's real local PIN handshake (AppleTvClient.ts) —
 * simpler than PS5's flow (no browser login step at all): starting pairing immediately makes the
 * Apple TV itself display a PIN, and this screen just needs it typed back in. No Apple ID or
 * password is ever involved anywhere in this process.
 */
export function AddAppleTvDeviceScreen({ driverRegistry, onCancel, onAdded, initialIpAddress }: AddAppleTvDeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("Apple TV");
  const [ipAddress, setIpAddress] = useState(initialIpAddress ?? "");
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function pollUntilSuccess(id: string): Promise<void> {
    const client = new AppleTvClient();
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const status = await client.getPairingStatus(id);
      if (status.status === "success") return;
      if (status.status === "error") throw new Error(status.errorMessage || "Pairing failed on Family Command Center");
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error("Timed out waiting for pairing to finish — try again");
  }

  async function handleStartPairing() {
    if (ipAddress.trim().length === 0) {
      setStage("error");
      setErrorMessage("Enter the Apple TV's IP address first.");
      return;
    }
    setBusy(true);
    setErrorMessage("");
    try {
      const result = await new AppleTvClient().startPairing(ipAddress.trim());
      setSessionId(result.sessionId);
      setStage("pin");
    } catch (err) {
      setStage("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitPin() {
    if (!sessionId || pin.trim().length === 0) return;
    const driver = driverRegistry.get(APPLE_TV_DRIVER_ID);
    if (!driver) {
      setStage("error");
      setErrorMessage("Apple TV driver is not registered in this build.");
      return;
    }
    setBusy(true);
    setErrorMessage("");
    try {
      await new AppleTvClient().submitPin(sessionId, pin.trim());
      await pollUntilSuccess(sessionId);
      setStage("saving");

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
      onAdded(device);
    } catch (err) {
      setStage("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <View style={styles.iconBadge}>
          <Ionicons name="tv-outline" size={20} color={theme.accentEnd} />
        </View>
        <Text style={styles.title}>Add Apple TV</Text>
      </View>

      {(stage === "idle" || stage === "error") && (
        <>
          <View style={styles.hintCard}>
            <Text style={styles.hint}>
              Pairing shows a PIN right on the Apple TV's own screen — no Apple ID or password is ever needed here.
              Requires Family Command Center to already be paired (Settings → the link icon on the home screen).
            </Text>
          </View>
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Apple TV" placeholderTextColor={theme.textTertiary} />
          <Text style={styles.label}>IP address</Text>
          <TextInput
            style={styles.input}
            value={ipAddress}
            onChangeText={setIpAddress}
            placeholder="192.168.1.90"
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
          {stage === "error" && (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
              <Text style={styles.error}>{errorMessage}</Text>
            </View>
          )}
          <View style={styles.row}>
            <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
            <CapabilityButton label={busy ? "Starting..." : "Pair"} variant="accent" onPress={handleStartPairing} disabled={busy} />
          </View>
        </>
      )}

      {stage === "pin" && (
        <>
          <View style={styles.hintCard}>
            <Text style={styles.hint}>Enter the PIN now showing on the Apple TV's own screen.</Text>
          </View>
          <Text style={styles.label}>PIN</Text>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={setPin}
            placeholder="1234"
            placeholderTextColor={theme.textTertiary}
            keyboardType="numbers-and-punctuation"
          />
          <View style={styles.row}>
            <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
            <CapabilityButton label={busy ? "Pairing..." : "Finish Pairing"} variant="accent" onPress={handleSubmitPin} disabled={busy} />
          </View>
        </>
      )}

      {stage === "saving" && <ActivityIndicator color={theme.accentEnd} style={styles.spinner} />}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
