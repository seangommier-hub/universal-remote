import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { XBOX_DRIVER_ID } from "../drivers/gaming/xbox/XboxDriver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { DeviceSetupGuideScreen } from "./DeviceSetupGuideScreen";
import { XBOX_SETUP_GUIDE } from "./deviceSetupSteps";
import { describePairingFailure, pairingPromptFor } from "../discovery/pairingCopy";
import { describeXboxLiveIdProblem, normalizeXboxLiveId } from "../discovery/xboxLiveId";
import { PairingProgressCard } from "./PairingProgressCard";
import { theme } from "./theme";
import { usePairingSession } from "./usePairingSession";

const XBOX_LABEL = "Xbox";
const XBOX_PROMPT = pairingPromptFor("xbox")!;

interface AddXboxDeviceScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  initialIpAddress?: string;
}

/**
 * Adds an Xbox for power-on only (ADR-HEARTH-064) — there's no pairing handshake to wait for
 * (the protocol is a one-way broadcast, see XboxDriver.ts), so unlike the TV screens this doesn't
 * attempt a live connection before accepting the device: there's no side-effect-free way to probe
 * an Xbox that might currently be off. ADR-HEARTH-155: what is checkable immediately is the Live
 * ID's shape (16 hex characters), so a mistyped one is flagged now, with the exact Settings path,
 * instead of silently failing at the first power-on.
 */
export function AddXboxDeviceScreen({ driverRegistry, onCancel, onAdded, initialIpAddress }: AddXboxDeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("Xbox");
  const [ipAddress, setIpAddress] = useState(initialIpAddress ?? "");
  const [liveId, setLiveId] = useState("");
  const [warned, setWarned] = useState(false);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const pairing = usePairingSession();

  if (showSetupGuide) {
    return <DeviceSetupGuideScreen guide={XBOX_SETUP_GUIDE} onDone={() => setShowSetupGuide(false)} />;
  }

  async function connectDevice(): Promise<Device> {
    const driver = driverRegistry.get(XBOX_DRIVER_ID);
    if (!driver) throw new Error("Xbox driver is not registered in this build.");
    const device: Device = {
      id: `xbox-${Date.now()}`,
      name: name.trim() || "Xbox",
      category: "gaming",
      manufacturer: "Microsoft",
      driverId: XBOX_DRIVER_ID,
      capabilities: driver.getCapabilities(),
      config: { liveId: normalizeXboxLiveId(liveId), ipAddress: ipAddress.trim() || undefined },
    };
    await driver.connect(device);
    return device;
  }

  function handleAdd() {
    if (liveIdProblem && !warned) return setWarned(true);
    pairing.start<Device>({ totalMs: XBOX_PROMPT.timeoutMs, run: connectDevice, onDone: onAdded });
  }

  const liveIdProblem = liveId.trim().length > 0 ? describeXboxLiveIdProblem(liveId) : null;
  const busy = pairing.state.phase === "waiting" || pairing.state.phase === "connected";
  const showCard = busy || pairing.state.phase === "failed";
  const failure = pairing.state.phase === "failed" ? describePairingFailure("xbox", XBOX_LABEL, pairing.state.error) : null;
  const canSubmit = liveId.trim().length > 0 && !busy;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <View style={styles.iconBadge}>
          <Ionicons name="game-controller-outline" size={20} color={theme.accentEnd} />
        </View>
        <Text style={styles.title}>Add Xbox</Text>
      </View>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>
          Power-on only — Xbox's local protocol has no way to power off, control media, or check whether it's already
          on without a full Microsoft account sign-in this app doesn't do. You'll need the console's Live ID from
          Settings → System → Console info.
        </Text>
      </View>
      <CapabilityButton label="Setup This Device" variant="ghost" onPress={() => setShowSetupGuide(true)} />

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Living Room Xbox" placeholderTextColor={theme.textTertiary} />

      <Text style={styles.label}>Live ID</Text>
      <TextInput
        style={styles.input}
        value={liveId}
        onChangeText={(text) => {
          setLiveId(text);
          setWarned(false);
        }}
        placeholder="From Settings → System → Console info"
        placeholderTextColor={theme.textTertiary}
        autoCapitalize="characters"
      />

      <Text style={styles.label}>IP address (optional, but more reliable)</Text>
      <TextInput
        style={styles.input}
        value={ipAddress}
        onChangeText={setIpAddress}
        placeholder="192.168.1.210"
        placeholderTextColor={theme.textTertiary}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
      />

      {liveIdProblem && (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
          <Text style={styles.error}>{liveIdProblem}{warned ? " Tap Add anyway if you're sure it's right." : ""}</Text>
        </View>
      )}

      {showCard && <PairingProgressCard state={pairing.state} prompt={XBOX_PROMPT} failure={failure} onRetry={pairing.retry} onCancel={pairing.cancel} />}

      {!showCard && (
        <View style={styles.row}>
          <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} />
          <CapabilityButton label={liveIdProblem && warned ? "Add anyway" : "Add"} variant="accent" onPress={handleAdd} disabled={!canSubmit} />
        </View>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
