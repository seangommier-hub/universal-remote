import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { KASA_PLUG_DRIVER_ID } from "../drivers/outlet/kasa/KasaPlugDriver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { DeviceSetupGuideScreen } from "./DeviceSetupGuideScreen";
import { KASA_SETUP_GUIDE } from "./deviceSetupSteps";
import { theme } from "./theme";

interface AddKasaDeviceScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  /** Pre-fills the IP field — used when this screen is reached from Discover Devices for a device whose brand wasn't auto-recognized (ADR-HEARTH-062), so the user doesn't have to re-type an IP already shown on screen. */
  initialIpAddress?: string;
}

/** Pairs a TP-Link Kasa smart plug by IP — no PSK, no on-screen approval, no pairing wait (the legacy protocol has no auth at all). See KASA_SETUP_GUIDE for the newer-firmware ("KLAP") limitation. */
export function AddKasaDeviceScreen({ driverRegistry, onCancel, onAdded, initialIpAddress }: AddKasaDeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("Kasa Plug");
  const [ipAddress, setIpAddress] = useState(initialIpAddress ?? "");
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  if (showSetupGuide) {
    return <DeviceSetupGuideScreen guide={KASA_SETUP_GUIDE} onDone={() => setShowSetupGuide(false)} />;
  }

  async function handleConnect() {
    const driver = driverRegistry.get(KASA_PLUG_DRIVER_ID);
    if (!driver) {
      setStatus("error");
      setErrorMessage("Kasa driver is not registered in this build.");
      return;
    }

    const device: Device = {
      id: `kasa-${Date.now()}`,
      name: name.trim() || "Kasa Plug",
      category: "outlet",
      manufacturer: "TP-Link",
      driverId: KASA_PLUG_DRIVER_ID,
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
          <Ionicons name="flash-outline" size={20} color={theme.accentEnd} />
        </View>
        <Text style={styles.title}>Add Kasa Plug</Text>
      </View>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>
          Works with TP-Link's older Kasa plugs and firmware — no pairing prompt. Newer Kasa firmware uses a different,
          encrypted protocol this doesn't support yet (see Setup This Device below).
        </Text>
      </View>
      <CapabilityButton label="Setup This Device" variant="ghost" onPress={() => setShowSetupGuide(true)} />

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Christmas Lights" placeholderTextColor={theme.textTertiary} />

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

      {status === "error" && (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
          <Text style={styles.error}>Couldn't connect: {errorMessage}</Text>
        </View>
      )}

      <View style={styles.row}>
        <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={status === "connecting"} />
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
