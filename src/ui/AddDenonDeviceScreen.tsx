import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { DENON_DRIVER_ID } from "../drivers/tv/denon/DenonDriver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface AddDenonDeviceScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  /** Pre-fills the IP field — used when this screen is reached from Discover Devices for a device whose brand wasn't auto-recognized (ADR-HEARTH-062), so the user doesn't have to re-type an IP already shown on screen. */
  initialIpAddress?: string;
}

/**
 * Pairs a Denon or Marantz AV receiver by manually-entered IP only — the legacy formiPhoneApp
 * control surface has no authentication scheme at all (LAN-trust model, same as Roku ECP/Yamaha
 * MusicCast/Sonos), so there's no PSK/key field. Attempts a real connection before accepting the
 * device; never adds a device it hasn't actually reached.
 */
export function AddDenonDeviceScreen({ driverRegistry, onCancel, onAdded, initialIpAddress }: AddDenonDeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("Denon Receiver");
  const [ipAddress, setIpAddress] = useState(initialIpAddress ?? "");
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleConnect() {
    const driver = driverRegistry.get(DENON_DRIVER_ID);
    if (!driver) {
      setStatus("error");
      setErrorMessage("Denon/Marantz driver is not registered in this build.");
      return;
    }

    const device: Device = {
      id: `denon-${Date.now()}`,
      name: name.trim() || "Denon Receiver",
      category: "tv",
      manufacturer: "Denon",
      driverId: DENON_DRIVER_ID,
      capabilities: driver.getCapabilities(),
      config: { ipAddress: ipAddress.trim() },
    };

    setStatus("connecting");
    setErrorMessage("");
    try {
      await driver.connect(device);
      onAdded(device);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
      driver.disconnect(device).catch(() => {});
    }
  }

  const canSubmit = ipAddress.trim().length > 0 && status !== "connecting";

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <View style={styles.iconBadge}>
          <Ionicons name="musical-notes-outline" size={20} color={theme.accentEnd} />
        </View>
        <Text style={styles.title}>Add Denon / Marantz</Text>
      </View>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>
          Works with Denon and Marantz AV receivers on your network — no pairing or password needed, just its IP
          address. Volume shows the receiver's own dB scale, not a 0-100 percentage. Input switching isn't supported
          yet.
        </Text>
      </View>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Living Room Receiver" placeholderTextColor={theme.textTertiary} />

      <Text style={styles.label}>IP address</Text>
      <TextInput
        style={styles.input}
        value={ipAddress}
        onChangeText={setIpAddress}
        placeholder="192.168.1.80"
        placeholderTextColor={theme.textTertiary}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
      />

      {status === "error" && (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
          <Text style={styles.error}>Couldn't connect: {errorMessage}</Text>
        </View>
      )}

      <View style={styles.row}>
        <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={status === "connecting"} />
        <CapabilityButton
          label={status === "connecting" ? "Connecting..." : "Connect"}
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
