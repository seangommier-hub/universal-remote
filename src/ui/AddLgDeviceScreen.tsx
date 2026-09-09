import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";
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
 * Pairs a real LG webOS TV over its unencrypted SSAP WebSocket (port 3000 — see
 * ADR-HEARTH-006). The TV will show an on-screen Allow/Deny prompt during connect; this screen
 * waits for that instead of assuming success. Newer LG TVs (~2023+) may only accept the
 * encrypted port 3001, which this driver doesn't support yet.
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.iconBadge}>
          <Ionicons name="tv-outline" size={20} color={theme.accentEnd} />
        </View>
        <Text style={styles.title}>Add LG TV</Text>
      </View>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>
          Watch the TV screen after tapping Connect — it will show an Allow/Deny prompt you need to accept within 30
          seconds. Only works if the TV still accepts the unencrypted port 3000 channel (see ADR-HEARTH-006); TVs from
          roughly 2023 on may reject it.
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
        <CapabilityButton
          icon="link-outline"
          label={status === "connecting" ? "Waiting for TV..." : "Connect"}
          variant="accent"
          onPress={handleConnect}
          disabled={!canSubmit}
        />
      </View>
      {status === "connecting" && <ActivityIndicator color={theme.accentEnd} style={styles.spinner} />}
    </ScrollView>
  );
}
