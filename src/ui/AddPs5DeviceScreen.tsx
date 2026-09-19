import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { Ps5Client } from "../drivers/gaming/ps5/Ps5Client";
import { PS5_DRIVER_ID } from "../drivers/gaming/ps5/Ps5Driver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface AddPs5DeviceScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  initialIpAddress?: string;
}

type PairStatus = "idle" | "listening" | "saving" | "error";

/**
 * Pairs a PS4/PS5 console for power-on-only wake (Ps5Client.ts/Ps5Driver.ts). Unlike every other
 * brand here, there's no PIN shown on a screen and no password field — the console's real wake
 * credential is only ever known to Sony's own official PlayStation App, so this screen briefly
 * makes the phone masquerade as a pairable console (via Ps5Client.captureCredentials) and waits
 * for the user to tap that entry inside their own PlayStation App, which then hands the real
 * credential over on this same local network. See Ps5Client.ts's doc comment for the two
 * reference implementations this was verified against.
 */
export function AddPs5DeviceScreen({ driverRegistry, onCancel, onAdded, initialIpAddress }: AddPs5DeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("PS5");
  const [ipAddress, setIpAddress] = useState(initialIpAddress ?? "");
  const [status, setStatus] = useState<PairStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function handlePair() {
    const driver = driverRegistry.get(PS5_DRIVER_ID);
    if (!driver) {
      setStatus("error");
      setErrorMessage("PS5 driver is not registered in this build.");
      return;
    }

    setStatus("listening");
    setErrorMessage("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const credentials = await new Ps5Client().captureCredentials(name.trim() || "PS5", () => {}, controller.signal);
      setStatus("saving");

      const device: Device = {
        id: `ps5-${Date.now()}`,
        name: name.trim() || "PS5",
        category: "gaming",
        manufacturer: "Sony",
        driverId: PS5_DRIVER_ID,
        capabilities: driver.getCapabilities(),
        config: { ipAddress: ipAddress.trim(), credentials },
      };
      await driver.connect(device);
      onAdded(device);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      abortRef.current = null;
    }
  }

  function handleCancelPairing() {
    abortRef.current?.abort();
  }

  const canSubmit = ipAddress.trim().length > 0 && status === "idle";

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <View style={styles.iconBadge}>
          <Ionicons name="game-controller-outline" size={20} color={theme.accentEnd} />
        </View>
        <Text style={styles.title}>Add PS5</Text>
      </View>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>
          Power-on only — there's no on-screen PIN for this one. When you tap Pair, this phone briefly appears as a
          device in Sony's own PlayStation App. Open that app, find the entry named below, and tap it once — Hearth
          will pick up the real credential automatically.
        </Text>
      </View>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="PS5" placeholderTextColor={theme.textTertiary} editable={status === "idle"} />

      <Text style={styles.label}>IP address</Text>
      <TextInput
        style={styles.input}
        value={ipAddress}
        onChangeText={setIpAddress}
        placeholder="192.168.1.220"
        placeholderTextColor={theme.textTertiary}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        editable={status === "idle"}
      />

      {status === "listening" && (
        <View style={styles.hintCard}>
          <Text style={styles.hint}>
            Listening for the PlayStation App now — open it, look for "{name.trim() || "PS5"}", and tap it. This will wait up to 2 minutes.
          </Text>
        </View>
      )}

      {status === "error" && (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
          <Text style={styles.error}>Couldn't pair: {errorMessage}</Text>
        </View>
      )}

      <View style={styles.row}>
        <CapabilityButton
          label="Cancel"
          variant="ghost"
          onPress={status === "listening" ? handleCancelPairing : onCancel}
          disabled={status === "saving"}
        />
        <CapabilityButton
          label={status === "listening" ? "Waiting for PlayStation App..." : status === "saving" ? "Saving..." : "Pair"}
          variant="accent"
          onPress={handlePair}
          disabled={!canSubmit}
        />
      </View>
      {(status === "listening" || status === "saving") && <ActivityIndicator color={theme.accentEnd} style={styles.spinner} />}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
