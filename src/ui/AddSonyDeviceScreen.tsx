import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { SONY_BRAVIA_DRIVER_ID } from "../drivers/tv/sony/SonyBraviaDriver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { DeviceSetupGuideScreen } from "./DeviceSetupGuideScreen";
import { SONY_SETUP_GUIDE } from "./deviceSetupSteps";
import { describePairingFailure, pairingPromptFor } from "../discovery/pairingCopy";
import { PairingProgressCard } from "./PairingProgressCard";
import { ThemedKeyboard } from "./ThemedKeyboard";
import { usePairingSession } from "./usePairingSession";
import { theme } from "./theme";

const SONY_LABEL = "Sony TV";
const SONY_PROMPT = pairingPromptFor("sony")!;

interface AddSonyDeviceScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  /** Pre-fills the IP field — used when this screen is reached from Discover Devices for a device whose brand wasn't auto-recognized (ADR-HEARTH-062), so the user doesn't have to re-type an IP already shown on screen. */
  initialIpAddress?: string;
}

/**
 * Pairs a real Sony BRAVIA TV by manually-entered IP + PSK (per docs/EXPO_COMPATIBILITY.md,
 * this works in Expo Go — no discovery/native module needed for this path). Attempts a real
 * connection before accepting the device; never adds a device it hasn't actually reached.
 */
export function AddSonyDeviceScreen({ driverRegistry, onCancel, onAdded, initialIpAddress }: AddSonyDeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("Sony TV");
  const [ipAddress, setIpAddress] = useState(initialIpAddress ?? "");
  const [psk, setPsk] = useState("");
  // Real-hardware ask (2026-09-10): a themed on-screen keyboard for password-style fields, since
  // the system keyboard's white background clashes with this screen's dark theme. Only this field
  // (the PSK) gets it — it's the one password-style input in the whole app right now.
  const [pskFocused, setPskFocused] = useState(false);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const pairing = usePairingSession();

  if (showSetupGuide) {
    return <DeviceSetupGuideScreen guide={SONY_SETUP_GUIDE} onDone={() => setShowSetupGuide(false)} />;
  }

  async function connectDevice(): Promise<Device> {
    const driver = driverRegistry.get(SONY_BRAVIA_DRIVER_ID);
    if (!driver) throw new Error("Sony driver is not registered in this build.");

    const device: Device = {
      id: `sony-${Date.now()}`,
      name: name.trim() || "Sony TV",
      category: "tv",
      manufacturer: "Sony",
      driverId: SONY_BRAVIA_DRIVER_ID,
      capabilities: driver.getCapabilities(),
      config: { ipAddress: ipAddress.trim(), psk: psk.trim() },
    };

    try {
      await driver.connect(device);
    } catch (err) {
      // See ADR-HEARTH-052 / AddLgDeviceScreen.tsx: SonyBraviaDriver.connect() (via refreshState's
      // own catch) schedules its own indefinite background reconnect loop on any failure, keyed to
      // this screen's throwaway `sony-${Date.now()}` device id. Since a failed attempt here is
      // never added/saved, nothing else ever owns or stops that loop — disconnect immediately to
      // cancel it.
      driver.disconnect(device).catch(() => {});
      throw err;
    }
    return device;
  }

  function handleConnect() {
    pairing.start<Device>({
      totalMs: SONY_PROMPT.timeoutMs,
      run: connectDevice,
      onDone: onAdded,
      discard: (device) => driverRegistry.get(SONY_BRAVIA_DRIVER_ID)?.disconnect(device).catch(() => {}),
    });
  }

  const busy = pairing.state.phase === "waiting" || pairing.state.phase === "connected";
  const showCard = busy || pairing.state.phase === "failed";
  const failure = pairing.state.phase === "failed" ? describePairingFailure("sony", SONY_LABEL, pairing.state.error) : null;
  const canSubmit = ipAddress.trim().length > 0 && psk.trim().length > 0 && !busy;

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
      <CapabilityButton label="Setup This Device" variant="ghost" onPress={() => setShowSetupGuide(true)} />

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

      {showCard && <PairingProgressCard state={pairing.state} prompt={SONY_PROMPT} failure={failure} onRetry={pairing.retry} onCancel={pairing.cancel} />}

      {!showCard && (
        <View style={styles.row}>
          <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} />
          <CapabilityButton label="Connect" variant="accent" onPress={handleConnect} disabled={!canSubmit} />
        </View>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
