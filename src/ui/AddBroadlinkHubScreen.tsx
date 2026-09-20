import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { BROADLINK_IR_DRIVER_ID } from "../drivers/irHub/broadlink/BroadlinkIrDriver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface AddBroadlinkHubScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  /** Pre-fills the IP field — used when this screen is reached from Discover Devices (ADR-HEARTH-062). */
  initialIpAddress?: string;
}

/**
 * Adds a Broadlink IR/RF hub by IP only — no pairing step exists (see BroadlinkClient.ts's own
 * doc comment: the hub accepts a fresh local handshake on every command, with no PSK/token to
 * capture up front). Unlike every other add screen, the new device starts with an EMPTY
 * capabilities list — it controls whatever dumb hardware the household points a real remote at,
 * and nothing is known until each button gets taught individually from the device's own menu
 * (TeachBroadlinkCommandScreen.tsx) after this screen hands off.
 */
export function AddBroadlinkHubScreen({ driverRegistry, onCancel, onAdded, initialIpAddress }: AddBroadlinkHubScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("IR/RF Hub");
  const [ipAddress, setIpAddress] = useState(initialIpAddress ?? "");
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleConnect() {
    if (ipAddress.trim().length === 0) {
      setStatus("error");
      setErrorMessage("Enter the hub's IP address first.");
      return;
    }

    const driver = driverRegistry.get(BROADLINK_IR_DRIVER_ID);
    if (!driver) {
      setStatus("error");
      setErrorMessage("Broadlink driver is not registered in this build.");
      return;
    }

    const device: Device = {
      id: `broadlink-${Date.now()}`,
      name: name.trim() || "IR/RF Hub",
      category: "other",
      manufacturer: "Broadlink",
      driverId: BROADLINK_IR_DRIVER_ID,
      capabilities: [], // nothing taught yet — grows one button at a time via TeachBroadlinkCommandScreen
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
          <Ionicons name="radio-outline" size={20} color={theme.accentEnd} />
        </View>
        <Text style={styles.title}>Add IR/RF Hub</Text>
      </View>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>
          Requires Family Command Center to already be paired (Settings → the link icon on the home screen). The hub
          itself needs to already be on your WiFi (set up once via its own Broadlink/e-control app) — Hearth doesn't
          do that first-time WiFi setup. After adding it here, teach it buttons one at a time from the device's own
          menu by pointing your existing remote at it.
        </Text>
      </View>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Living Room IR Hub" placeholderTextColor={theme.textTertiary} />

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
          <Text style={styles.error}>Couldn't add it: {errorMessage}</Text>
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
