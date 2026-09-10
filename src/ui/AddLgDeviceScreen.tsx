import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { LG_WEBOS_DRIVER_ID } from "../drivers/tv/lg/LgWebOsDriver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface AddLgDeviceScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
}

/**
 * Pairs a real LG webOS TV over its encrypted SSAP WebSocket (port 3001, via Family Command
 * Center's relay — see ADR-HEARTH-014). The TV will show an on-screen Allow/Deny prompt during
 * connect; this screen waits for that instead of assuming success. Requires Family Command
 * Center to be paired first (Settings → the home-screen link icon) — the direct connection
 * attempt always fails by design (React Native can't trust the TV's certificate), and without a
 * relay configured there's nothing to fall back to.
 */
export function AddLgDeviceScreen({ driverRegistry, onCancel, onAdded }: AddLgDeviceScreenProps) {
  const [name, setName] = useState("LG TV");
  const [ipAddress, setIpAddress] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleConnect() {
    const driver = driverRegistry.get(LG_WEBOS_DRIVER_ID);
    if (!driver) {
      setStatus("error");
      setErrorMessage("LG driver is not registered in this build.");
      return;
    }

    const device: Device = {
      id: `lg-${Date.now()}`,
      name: name.trim() || "LG TV",
      category: "tv",
      manufacturer: "LG",
      driverId: LG_WEBOS_DRIVER_ID,
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
        <Text style={styles.title}>Add LG TV</Text>
      </View>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>
          Watch the TV screen after tapping Connect — it will show an Allow/Deny prompt you need to accept within 30
          seconds. Requires Family Command Center to already be paired (Settings → the link icon on the home screen).
        </Text>
      </View>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Bedroom TV" placeholderTextColor={theme.textTertiary} />

      <Text style={styles.label}>IP address</Text>
      <TextInput
        style={styles.input}
        value={ipAddress}
        onChangeText={setIpAddress}
        placeholder="192.168.1.70"
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
