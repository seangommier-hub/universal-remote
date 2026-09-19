import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { CHROMECAST_DRIVER_ID } from "../drivers/streaming/chromecast/ChromecastDriver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface AddChromecastDeviceScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  /** Pre-fills the IP field — used when this screen is reached from Discover Devices for a device whose brand wasn't auto-recognized (ADR-HEARTH-062), so the user doesn't have to re-type an IP already shown on screen. */
  initialIpAddress?: string;
}

/**
 * Pairs a Chromecast by manually-entered IP only. Unlike the other manual-add screens, this one
 * requires Family Command Center — Chromecast's CastV2 protocol needs a real TCP+TLS socket
 * this app doesn't attempt directly (see ChromecastClient.ts's own doc comment for why).
 */
export function AddChromecastDeviceScreen({ driverRegistry, onCancel, onAdded, initialIpAddress }: AddChromecastDeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("Chromecast");
  const [ipAddress, setIpAddress] = useState(initialIpAddress ?? "");
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleConnect() {
    if (ipAddress.trim().length === 0) {
      setStatus("error");
      setErrorMessage("Enter the Chromecast's IP address first.");
      return;
    }

    const driver = driverRegistry.get(CHROMECAST_DRIVER_ID);
    if (!driver) {
      setStatus("error");
      setErrorMessage("Chromecast driver is not registered in this build.");
      return;
    }

    const device: Device = {
      id: `chromecast-${Date.now()}`,
      name: name.trim() || "Chromecast",
      category: "streaming",
      manufacturer: "Google",
      driverId: CHROMECAST_DRIVER_ID,
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

  const canSubmit = status !== "connecting";

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <View style={styles.iconBadge}>
          <Ionicons name="tv-outline" size={20} color={theme.accentEnd} />
        </View>
        <Text style={styles.title}>Add Chromecast</Text>
      </View>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>
          Requires Family Command Center to already be paired (Settings → the link icon on the home screen) — volume
          and mute only for now, and only its own real 0-100%-style level, no input switching or playback control
          yet.
        </Text>
      </View>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Living Room Chromecast" placeholderTextColor={theme.textTertiary} />

      <Text style={styles.label}>IP address</Text>
      <TextInput
        style={styles.input}
        value={ipAddress}
        onChangeText={setIpAddress}
        placeholder="192.168.1.95"
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
