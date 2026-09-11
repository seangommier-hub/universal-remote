import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { HueBridgeClient, HuePairingPendingError } from "../drivers/lighting/hue/HueBridgeClient";
import { HUE_LIGHT_DRIVER_ID } from "../drivers/lighting/hue/HueLightDriver";
import { findMacByIp } from "../discovery/familyCommandCenterDeviceLookup";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface AddHueDeviceScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
}

type Phase =
  | { name: "pairing" }
  | { name: "pending-link-press" }
  | { name: "picking-light"; username: string; lights: Record<string, { name: string }> }
  | { name: "connecting"; username: string; lightId: string }
  | { name: "error"; message: string };

/**
 * Pairs a Philips Hue bridge (ADR-HEARTH-032) — a two-step flow, unlike the single-form TV
 * screens: (1) pair with the bridge itself (physical link-button press, produces a `username` API
 * key good for every light on it), then (2) pick which light this `Device` represents. Hue models
 * one bridge with many lights; Hearth models one `Device` per light, so pairing the bridge and
 * adding a light are two distinct steps here.
 */
export function AddHueDeviceScreen({ driverRegistry, onCancel, onAdded }: AddHueDeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [bridgeIpAddress, setBridgeIpAddress] = useState("");
  const [phase, setPhase] = useState<Phase>({ name: "pairing" });

  async function handlePair() {
    const client = new HueBridgeClient({ bridgeIpAddress: bridgeIpAddress.trim() });
    setPhase({ name: "pending-link-press" });
    try {
      const username = await client.pair("hearth#mobile-app");
      const lights = await client.listLights(username);
      setPhase({ name: "picking-light", username, lights });
    } catch (err) {
      if (err instanceof HuePairingPendingError) {
        setPhase({ name: "pairing" });
        return;
      }
      setPhase({ name: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function handleSelectLight(username: string, lightId: string, lightName: string) {
    const driver = driverRegistry.get(HUE_LIGHT_DRIVER_ID);
    if (!driver) {
      setPhase({ name: "error", message: "Hue driver is not registered in this build." });
      return;
    }

    const device: Device = {
      id: `hue-${lightId}-${Date.now()}`,
      name: lightName,
      category: "lighting",
      manufacturer: "Philips",
      driverId: HUE_LIGHT_DRIVER_ID,
      capabilities: driver.getCapabilities(),
      config: { bridgeIpAddress: bridgeIpAddress.trim(), username, lightId },
    };

    setPhase({ name: "connecting", username, lightId });
    try {
      await driver.connect(device);
      // Real-hardware finding (2026-09-10, ADR-HEARTH-017): a hwaddr on file lets the driver
      // re-locate this bridge automatically if it ever moves to a different WiFi network — best
      // backfilled right at pairing time, the same way EditDeviceAddressScreen does for a device
      // fixed by hand later. Best-effort: a bridge the Family Command Center doesn't know about
      // yet just doesn't get this, same as any manually-paired device today.
      const hwaddr = await findMacByIp(bridgeIpAddress.trim());
      if (hwaddr) device.config = { ...device.config, hwaddr };
      onAdded(device);
    } catch (err) {
      setPhase({ name: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const canPair = bridgeIpAddress.trim().length > 0 && phase.name !== "pending-link-press" && phase.name !== "connecting";

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="bulb-outline" size={20} color={theme.accentEnd} />
          </View>
          <Text style={styles.title}>Add Philips Hue</Text>
        </View>
        <View style={styles.hintCard}>
          <Text style={styles.hint}>
            Find your bridge's IP address in the Hue app (Settings → My Bridge), then press the round button on top of
            the bridge before tapping Pair.
          </Text>
        </View>

        <Text style={styles.label}>Bridge IP address</Text>
        <TextInput
          style={styles.input}
          value={bridgeIpAddress}
          onChangeText={setBridgeIpAddress}
          placeholder="192.168.1.50"
          placeholderTextColor={theme.textTertiary}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          editable={phase.name !== "connecting"}
        />

        {phase.name === "pending-link-press" && (
          <View style={styles.hintCard}>
            <Text style={styles.hint}>Waiting for the bridge's link button to be pressed…</Text>
          </View>
        )}

        {phase.name === "error" && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
            <Text style={styles.error}>Couldn't connect: {phase.message}</Text>
          </View>
        )}

        {phase.name === "picking-light" && (
          <View style={hueStyles.lightList}>
            <Text style={styles.label}>Choose a light</Text>
            {Object.entries(phase.lights).map(([lightId, light]) => (
              <CapabilityButton
                key={lightId}
                label={light.name}
                onPress={() => handleSelectLight(phase.username, lightId, light.name)}
                containerStyle={hueStyles.lightButton}
              />
            ))}
            {Object.keys(phase.lights).length === 0 && <Text style={styles.hint}>No lights found on this bridge yet.</Text>}
          </View>
        )}

        <View style={styles.row}>
          <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={phase.name === "connecting"} />
          {phase.name !== "picking-light" && (
            <CapabilityButton
              label={phase.name === "pending-link-press" ? "Pairing..." : "Pair"}
              variant="accent"
              onPress={handlePair}
              disabled={!canPair}
            />
          )}
        </View>
        {(phase.name === "pending-link-press" || phase.name === "connecting") && (
          <ActivityIndicator color={theme.accentEnd} style={styles.spinner} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const hueStyles = StyleSheet.create({
  lightList: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  lightButton: { width: "100%" },
});
