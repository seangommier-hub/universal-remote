import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { findMacByIp } from "../discovery/familyCommandCenterDeviceLookup";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface EditDeviceAddressScreenProps {
  device: Device;
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onSaved: (device: Device) => void;
}

/**
 * Real-hardware need (2026-09-10): a device's saved IP goes stale the moment it moves to a
 * different WiFi network — the fastest fix shouldn't be "unpair it and start the whole pairing
 * flow over." Updates `config.ipAddress` in place and verifies the new address actually works
 * (a real driver.connect(), same as every Add*DeviceScreen — never saves an address that hasn't
 * been proven reachable) before committing anything. If the device has no `hwaddr` on file yet
 * (it was paired manually, not through Discover), this also backfills one via a reverse Family
 * Command Center lookup at the new address — so a device fixed by hand once can still self-heal
 * automatically the *next* time its IP changes, instead of needing this screen again forever.
 */
export function EditDeviceAddressScreen({ device, driverRegistry, onCancel, onSaved }: EditDeviceAddressScreenProps) {
  const insets = useSafeAreaInsets();
  const currentAddress = typeof device.config?.ipAddress === "string" ? device.config.ipAddress : "";
  const [ipAddress, setIpAddress] = useState(currentAddress);
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSave() {
    const driver = driverRegistry.get(device.driverId);
    if (!driver) {
      setStatus("error");
      setErrorMessage("This device's driver is not registered in this build.");
      return;
    }

    const trimmed = ipAddress.trim();
    const updated: Device = { ...device, config: { ...device.config, ipAddress: trimmed } };

    setStatus("connecting");
    setErrorMessage("");
    try {
      await driver.connect(updated);
      if (typeof updated.config?.hwaddr !== "string") {
        const hwaddr = await findMacByIp(trimmed);
        if (hwaddr && updated.config) updated.config.hwaddr = hwaddr;
      }
      onSaved(updated);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  const canSubmit = ipAddress.trim().length > 0 && ipAddress.trim() !== currentAddress && status !== "connecting";

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="create-outline" size={20} color={theme.accentEnd} />
          </View>
          <Text style={styles.title}>Update {device.name}</Text>
        </View>
        <View style={styles.hintCard}>
          <Text style={styles.hint}>
            If {device.name} moved to a different WiFi network, its old address stops working. Enter its current IP
            below — this checks it actually connects before saving anything.
          </Text>
        </View>

        <Text style={styles.label}>IP address</Text>
        <TextInput
          style={styles.input}
          value={ipAddress}
          onChangeText={setIpAddress}
          placeholder="192.168.1.50"
          placeholderTextColor={theme.textTertiary}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          editable={status !== "connecting"}
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
            label={status === "connecting" ? "Checking..." : "Save"}
            variant="accent"
            onPress={handleSave}
            disabled={!canSubmit}
          />
        </View>
        {status === "connecting" && <ActivityIndicator color={theme.accentEnd} style={styles.spinner} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
