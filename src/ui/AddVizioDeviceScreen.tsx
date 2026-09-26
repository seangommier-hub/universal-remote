import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { getBrand } from "../discovery/brandRegistry";
import { describePairingFailure, pairingPromptFor } from "../discovery/pairingCopy";
import { VizioPairingStart, beginVizioPairing, completeVizioPairing } from "../drivers/tv/vizio/vizioPairingFlow";
import { VIZIO_SMARTCAST_DRIVER_ID } from "../drivers/tv/vizio/VizioSmartCastDriver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { DeviceSetupGuideScreen } from "./DeviceSetupGuideScreen";
import { VIZIO_SETUP_GUIDE } from "./deviceSetupSteps";
import { theme } from "./theme";

interface AddVizioDeviceScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  initialIpAddress?: string;
}

type Stage = "form" | "pin";

const VIZIO_BRAND = getBrand("vizio");
const VIZIO_PROMPT = pairingPromptFor("vizio")!;

/** Pairs a Vizio SmartCast TV: the TV shows a PIN on its own screen and the user types it back (ADR-HEARTH-165). */
export function AddVizioDeviceScreen({ driverRegistry, onCancel, onAdded, initialIpAddress }: AddVizioDeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(VIZIO_BRAND.defaultName);
  const [ipAddress, setIpAddress] = useState(initialIpAddress ?? "");
  const [stage, setStage] = useState<Stage>("form");
  const [start, setStart] = useState<VizioPairingStart | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  if (showSetupGuide) return <DeviceSetupGuideScreen guide={VIZIO_SETUP_GUIDE} onDone={() => setShowSetupGuide(false)} />;

  async function handleStart() {
    if (ipAddress.trim().length === 0) return setError("Enter the TV's IP address first.");
    setBusy(true);
    setError("");
    try {
      setStart(await beginVizioPairing(ipAddress.trim()));
      setPin("");
      setStage("pin");
    } catch (failure) {
      setError(describePairingFailure("vizio", VIZIO_BRAND.label, failure).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleFinish() {
    const driver = driverRegistry.get(VIZIO_SMARTCAST_DRIVER_ID);
    if (!start || !driver) return setError("The Vizio driver is not available in this build.");
    setBusy(true);
    setError("");
    try {
      onAdded(await completeVizioPairing(driver, start, pin.trim(), name));
    } catch (failure) {
      setError(describePairingFailure("vizio", VIZIO_BRAND.label, failure).message);
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
          <Text style={styles.title} accessibilityRole="header">Add Vizio TV</Text>
        </View>

        {stage === "form" ? (
          <>
            <View style={styles.hintCard}>
              <Text style={styles.hint}>{VIZIO_BRAND.hint} Requires Family Command Center to already be connected.</Text>
            </View>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Vizio TV" placeholderTextColor={theme.textTertiary} accessibilityLabel="Device name" />
            <Text style={styles.label}>IP address</Text>
            <TextInput style={styles.input} value={ipAddress} onChangeText={setIpAddress} placeholder="192.168.1.88" placeholderTextColor={theme.textTertiary} autoCapitalize="none" keyboardType="numbers-and-punctuation" accessibilityLabel="IP address" />
          </>
        ) : (
          <>
            <View style={styles.hintCard}>
              <Text style={styles.hint} accessibilityRole="header">{VIZIO_PROMPT.heading}</Text>
              <Text style={styles.hint}>{VIZIO_PROMPT.instruction}</Text>
            </View>
            <Text style={styles.label}>PIN</Text>
            <TextInput style={styles.input} value={pin} onChangeText={setPin} placeholder="1234" placeholderTextColor={theme.textTertiary} keyboardType="number-pad" autoFocus accessibilityLabel="Vizio PIN" />
          </>
        )}

        {error.length > 0 && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
            <Text style={styles.error}>{error}</Text>
          </View>
        )}

        <View style={styles.row}>
          <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
          {stage === "form" ? (
            <>
              <CapabilityButton label="Setup steps" variant="ghost" onPress={() => setShowSetupGuide(true)} disabled={busy} />
              <CapabilityButton label={busy ? "Starting..." : "Pair"} variant="accent" onPress={handleStart} disabled={busy} />
            </>
          ) : (
            <CapabilityButton label={busy ? "Checking..." : "Finish Pairing"} variant="accent" onPress={handleFinish} disabled={busy || pin.trim().length === 0} />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
