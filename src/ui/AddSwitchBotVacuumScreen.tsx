import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { SwitchBotClient, SwitchBotDeviceSummary } from "../drivers/vacuum/switchbot/SwitchBotClient";
import { SUPPORTED_VACUUM_DEVICE_TYPES, SWITCHBOT_VACUUM_DRIVER_ID } from "../drivers/vacuum/switchbot/SwitchBotVacuumDriver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface AddSwitchBotVacuumScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
}

type Phase =
  | { name: "entering-credentials" }
  | { name: "picking-vacuum"; devices: SwitchBotDeviceSummary[] }
  | { name: "connecting" }
  | { name: "error"; message: string };

/**
 * Pairs a SwitchBot robot vacuum (ADR-HEARTH-118) — same two-step shape as Hue (credentials first,
 * then pick which device), but the credential here is a token+secret pair the user copies from
 * their own SwitchBot app (Profile > Preferences > About > tap App Version 10x > Developer
 * Options > Get Token), never their SwitchBot account password — this screen never asks for one.
 */
export function AddSwitchBotVacuumScreen({ driverRegistry, onCancel, onAdded }: AddSwitchBotVacuumScreenProps) {
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [phase, setPhase] = useState<Phase>({ name: "entering-credentials" });

  async function handleListDevices() {
    const client = new SwitchBotClient({ token: token.trim(), secret: secret.trim() });
    setPhase({ name: "connecting" });
    try {
      const allDevices = await client.listDevices();
      const vacuums = allDevices.filter((d) => SUPPORTED_VACUUM_DEVICE_TYPES.includes(d.deviceType));
      setPhase({ name: "picking-vacuum", devices: vacuums });
    } catch (err) {
      setPhase({ name: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function handleSelectVacuum(summary: SwitchBotDeviceSummary) {
    const driver = driverRegistry.get(SWITCHBOT_VACUUM_DRIVER_ID);
    if (!driver) {
      setPhase({ name: "error", message: "SwitchBot vacuum driver is not registered in this build." });
      return;
    }

    const device: Device = {
      id: `switchbot-${summary.deviceId}-${Date.now()}`,
      name: summary.deviceName,
      category: "vacuum",
      manufacturer: "SwitchBot",
      model: summary.deviceType,
      driverId: SWITCHBOT_VACUUM_DRIVER_ID,
      capabilities: driver.getCapabilities(),
      config: { token: token.trim(), secret: secret.trim(), deviceId: summary.deviceId },
    };

    setPhase({ name: "connecting" });
    try {
      await driver.connect(device);
      onAdded(device);
    } catch (err) {
      setPhase({ name: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const canListDevices = token.trim().length > 0 && secret.trim().length > 0 && phase.name !== "connecting";

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="hardware-chip-outline" size={20} color={theme.accentEnd} />
          </View>
          <Text style={styles.title}>Add SwitchBot Vacuum</Text>
        </View>
        <View style={styles.hintCard}>
          <Text style={styles.hint}>
            In the SwitchBot app: Profile → Preferences → About, tap the App Version 10 times to unlock Developer
            Options, then tap Get Token. This gives you a token and a secret — never your SwitchBot account password.
          </Text>
        </View>

        <Text style={styles.label}>Token</Text>
        <TextInput
          style={styles.input}
          value={token}
          onChangeText={setToken}
          placeholder="Open token from the SwitchBot app"
          placeholderTextColor={theme.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          editable={phase.name !== "connecting"}
        />
        <Text style={styles.label}>Secret</Text>
        <TextInput
          style={styles.input}
          value={secret}
          onChangeText={setSecret}
          placeholder="Secret key from the SwitchBot app"
          placeholderTextColor={theme.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          editable={phase.name !== "connecting"}
        />

        {phase.name === "error" && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
            <Text style={styles.error}>Couldn't connect: {phase.message}</Text>
          </View>
        )}

        {phase.name === "picking-vacuum" && (
          <View style={vacuumStyles.list}>
            <Text style={styles.label}>Choose a vacuum</Text>
            {phase.devices.map((d) => (
              <CapabilityButton key={d.deviceId} label={`${d.deviceName} (${d.deviceType})`} onPress={() => handleSelectVacuum(d)} containerStyle={vacuumStyles.button} />
            ))}
            {phase.devices.length === 0 && (
              <Text style={styles.hint}>
                No supported robot vacuums found on this SwitchBot account. Supported models: {SUPPORTED_VACUUM_DEVICE_TYPES.join(", ")}.
              </Text>
            )}
          </View>
        )}

        <View style={styles.row}>
          <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={phase.name === "connecting"} />
          {phase.name !== "picking-vacuum" && (
            <CapabilityButton label={phase.name === "connecting" ? "Connecting..." : "Find Vacuums"} variant="accent" onPress={handleListDevices} disabled={!canListDevices} />
          )}
        </View>
        {phase.name === "connecting" && <ActivityIndicator color={theme.accentEnd} style={styles.spinner} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const vacuumStyles = StyleSheet.create({
  list: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  button: { width: "100%" },
});
