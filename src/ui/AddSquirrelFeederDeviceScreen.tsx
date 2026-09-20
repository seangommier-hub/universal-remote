import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { SQUIRREL_FEEDER_DRIVER_ID } from "../drivers/feeder/squirrelFeeder/SquirrelFeederDriver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface AddSquirrelFeederDeviceScreenProps {
  driverRegistry: DriverRegistry;
  onAdded: (device: Device) => void;
}

/**
 * Pairs the ESP32 squirrel feeder by IP — no PSK, no on-screen approval, same as Kasa (see
 * AddKasaDeviceScreen.tsx): the feeder's own HTTP API has no auth step at all. Lives inside the
 * Feeder tab itself rather than the Devices tab's "+ Add" picker (ADR-HEARTH-104) — this is the
 * tab's own empty state, so there's no "Cancel" destination and no `onCancel` prop.
 */
export function AddSquirrelFeederDeviceScreen({ driverRegistry, onAdded }: AddSquirrelFeederDeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("Squirrel Feeder");
  const [ipAddress, setIpAddress] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleConnect() {
    const driver = driverRegistry.get(SQUIRREL_FEEDER_DRIVER_ID);
    if (!driver) {
      setStatus("error");
      setErrorMessage("Squirrel feeder driver is not registered in this build.");
      return;
    }

    const device: Device = {
      id: `squirrel-feeder-${Date.now()}`,
      name: name.trim() || "Squirrel Feeder",
      category: "feeder",
      manufacturer: "DIY (ESP32)",
      driverId: SQUIRREL_FEEDER_DRIVER_ID,
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
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="paw-outline" size={20} color={theme.accentEnd} />
          </View>
          <Text style={styles.title}>Add Squirrel Feeder</Text>
        </View>
        <View style={styles.hintCard}>
          <Text style={styles.hint}>
            Connects to your ESP32 feeder's local HTTP API on your home Wi-Fi — no pairing step. Find its IP address from your router or the
            feeder's own serial log.
          </Text>
        </View>

        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Squirrel Feeder" placeholderTextColor={theme.textTertiary} />

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
