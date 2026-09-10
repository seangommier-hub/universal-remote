import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { SAMSUNG_TIZEN_DRIVER_ID } from "../drivers/tv/samsung/SamsungTizenDriver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface AddSamsungDeviceScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
}

/**
 * Pairs a real Samsung Tizen TV over its unencrypted remote-control WebSocket (port 8001 —
 * see ADR-HEARTH-005). The TV will show an on-screen Allow/Deny prompt during connect; this
 * screen waits for that instead of assuming success.
 */
export function AddSamsungDeviceScreen({ driverRegistry, onCancel, onAdded }: AddSamsungDeviceScreenProps) {
  const [name, setName] = useState("Samsung TV");
  const [ipAddress, setIpAddress] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleConnect() {
    const driver = driverRegistry.get(SAMSUNG_TIZEN_DRIVER_ID);
    if (!driver) {
      setStatus("error");
      setErrorMessage("Samsung driver is not registered in this build.");
      return;
    }

    const device: Device = {
      id: `samsung-${Date.now()}`,
      name: name.trim() || "Samsung TV",
      category: "tv",
      manufacturer: "Samsung",
      driverId: SAMSUNG_TIZEN_DRIVER_ID,
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
    }
  }

  const canSubmit = ipAddress.trim().length > 0 && status !== "connecting";

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <View style={styles.iconBadge}>
          <Ionicons name="tv-outline" size={20} color={theme.accentEnd} />
        </View>
        <Text style={styles.title}>Add Samsung TV</Text>
      </View>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>
          Watch the TV screen after tapping Connect — it will show an Allow/Deny prompt you need to accept within 20
          seconds. This only works if the TV still accepts the unencrypted port 8001 channel (see ADR-HEARTH-005);
          newer firmware may reject it.
        </Text>
      </View>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Bedroom TV" placeholderTextColor={theme.textTertiary} />

      <Text style={styles.label}>IP address</Text>
      <TextInput
        style={styles.input}
        value={ipAddress}
        onChangeText={setIpAddress}
        placeholder="192.168.1.60"
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
            "Waiting for TV..." text at all. No icon here now. */}
        <CapabilityButton
          label={status === "connecting" ? "Waiting for TV..." : "Connect"}
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
