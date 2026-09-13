import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { ROKU_ECP_DRIVER_ID } from "../drivers/streaming/roku/RokuEcpDriver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface AddRokuDeviceScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  /** Pre-fills the IP field — used when this screen is reached from Discover Devices for a device whose brand wasn't auto-recognized (ADR-HEARTH-062), so the user doesn't have to re-type an IP already shown on screen. */
  initialIpAddress?: string;
}

/** Pairs a real Roku device by IP — no PSK, no on-screen approval, no pairing wait (ECP has no auth). */
export function AddRokuDeviceScreen({ driverRegistry, onCancel, onAdded, initialIpAddress }: AddRokuDeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("Roku");
  const [ipAddress, setIpAddress] = useState(initialIpAddress ?? "");
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleConnect() {
    const driver = driverRegistry.get(ROKU_ECP_DRIVER_ID);
    if (!driver) {
      setStatus("error");
      setErrorMessage("Roku driver is not registered in this build.");
      return;
    }

    const device: Device = {
      id: `roku-${Date.now()}`,
      name: name.trim() || "Roku",
      category: "streaming",
      manufacturer: "Roku",
      driverId: ROKU_ECP_DRIVER_ID,
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
      // See ADR-HEARTH-052 / AddLgDeviceScreen.tsx: RokuEcpDriver.connect() schedules its own
      // indefinite background reconnect loop on any failure, keyed to this screen's throwaway
      // `roku-${Date.now()}` device id. Since a failed attempt here is never added/saved, nothing
      // else ever owns or stops that loop — disconnect immediately to cancel it.
      driver.disconnect(device).catch(() => {});
    }
  }

  const canSubmit = ipAddress.trim().length > 0 && status !== "connecting";

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <View style={styles.iconBadge}>
          <Ionicons name="play-circle-outline" size={20} color={theme.accentEnd} />
        </View>
        <Text style={styles.title}>Add Roku</Text>
      </View>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>
          Works for both Roku streaming devices and Roku TVs. No pairing prompt — make sure "Control by mobile apps" is
          enabled (Settings → System → Advanced system settings) if the connection fails.
        </Text>
      </View>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Living Room Roku" placeholderTextColor={theme.textTertiary} />

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
        {/* Real-device finding (2026-09-10): CapabilityButton never shows both an icon and a
            visible label — this button rendered as a bare link glyph with no visible "Connect" /
            "Connecting..." text at all. No icon here now. */}
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
