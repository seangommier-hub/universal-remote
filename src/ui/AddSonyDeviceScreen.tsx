import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { SONY_BRAVIA_DRIVER_ID } from "../drivers/tv/sony/SonyBraviaDriver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { ThemedKeyboard } from "./ThemedKeyboard";
import { theme } from "./theme";

interface AddSonyDeviceScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
}

/**
 * Pairs a real Sony BRAVIA TV by manually-entered IP + PSK (per docs/EXPO_COMPATIBILITY.md,
 * this works in Expo Go — no discovery/native module needed for this path). Attempts a real
 * connection before accepting the device; never adds a device it hasn't actually reached.
 */
export function AddSonyDeviceScreen({ driverRegistry, onCancel, onAdded }: AddSonyDeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("Sony TV");
  const [ipAddress, setIpAddress] = useState("");
  const [psk, setPsk] = useState("");
  // Real-hardware ask (2026-09-10): a themed on-screen keyboard for password-style fields, since
  // the system keyboard's white background clashes with this screen's dark theme. Only this field
  // (the PSK) gets it — it's the one password-style input in the whole app right now.
  const [pskFocused, setPskFocused] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleConnect() {
    const driver = driverRegistry.get(SONY_BRAVIA_DRIVER_ID);
    if (!driver) {
      setStatus("error");
      setErrorMessage("Sony driver is not registered in this build.");
      return;
    }

    const device: Device = {
      id: `sony-${Date.now()}`,
      name: name.trim() || "Sony TV",
      category: "tv",
      manufacturer: "Sony",
      driverId: SONY_BRAVIA_DRIVER_ID,
      capabilities: driver.getCapabilities(),
      config: { ipAddress: ipAddress.trim(), psk: psk.trim() },
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

  const canSubmit = ipAddress.trim().length > 0 && psk.trim().length > 0 && status !== "connecting";

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <View style={styles.iconBadge}>
          <Ionicons name="tv-outline" size={20} color={theme.accentEnd} />
        </View>
        <Text style={styles.title}>Add Sony TV</Text>
      </View>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>
          Enable IP Control on the TV first (Settings → Network &amp; Internet → Home Network → IP Control) and set a
          Pre-Shared Key there.
        </Text>
      </View>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Living Room TV" placeholderTextColor={theme.textTertiary} />

      <Text style={styles.label}>IP address</Text>
      <TextInput
        style={styles.input}
        value={ipAddress}
        onChangeText={setIpAddress}
        placeholder="192.168.1.50"
        placeholderTextColor={theme.textTertiary}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
      />

      <Text style={styles.label}>Pre-shared key</Text>
      <TextInput
        style={styles.input}
        value={psk}
        onChangeText={setPsk}
        placeholder="From the TV's IP Control settings"
        placeholderTextColor={theme.textTertiary}
        autoCapitalize="none"
        secureTextEntry
        showSoftInputOnFocus={false}
        onFocus={() => setPskFocused(true)}
        caretHidden={false}
      />
      {pskFocused && <ThemedKeyboard value={psk} onChange={setPsk} onDone={() => setPskFocused(false)} />}

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
