import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { XBOX_DRIVER_ID } from "../drivers/gaming/xbox/XboxDriver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { DeviceSetupGuideScreen } from "./DeviceSetupGuideScreen";
import { XBOX_SETUP_GUIDE } from "./deviceSetupSteps";
import { theme } from "./theme";

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
 * an Xbox that might currently be off. The Live ID is trusted as the user typed it, straight off
 * the console's own settings screen.
 */
export function AddXboxDeviceScreen({ driverRegistry, onCancel, onAdded, initialIpAddress }: AddXboxDeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("Xbox");
  const [ipAddress, setIpAddress] = useState(initialIpAddress ?? "");
  const [liveId, setLiveId] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  if (showSetupGuide) {
    return <DeviceSetupGuideScreen guide={XBOX_SETUP_GUIDE} onDone={() => setShowSetupGuide(false)} />;
  }

  async function handleConnect() {
    const driver = driverRegistry.get(XBOX_DRIVER_ID);
    if (!driver) {
      setStatus("error");
      setErrorMessage("Xbox driver is not registered in this build.");
      return;
    }

    const device: Device = {
      id: `xbox-${Date.now()}`,
      name: name.trim() || "Xbox",
      category: "gaming",
      manufacturer: "Microsoft",
      driverId: XBOX_DRIVER_ID,
      capabilities: driver.getCapabilities(),
      config: { liveId: liveId.trim(), ipAddress: ipAddress.trim() || undefined },
    };

    setStatus("connecting");
    setErrorMessage("");
    try {
      await driver.connect(device);
      onAdded(device);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  const canSubmit = liveId.trim().length > 0 && status !== "connecting";

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
        onChangeText={setLiveId}
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

      {status === "error" && (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
          <Text style={styles.error}>Couldn't add: {errorMessage}</Text>
        </View>
      )}

      <View style={styles.row}>
        <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={status === "connecting"} />
        <CapabilityButton
          label={status === "connecting" ? "Adding..." : "Add"}
          variant="accent"
          onPress={handleConnect}
          disabled={!canSubmit}
        />
      </View>
      {status === "connecting" && <ActivityIndicator color={theme.accentEnd} style={styles.spinner} />}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
