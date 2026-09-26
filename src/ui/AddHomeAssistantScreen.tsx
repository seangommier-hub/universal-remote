import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { HomeAssistantClient } from "../drivers/homeAssistant/HomeAssistantClient";
import { HOME_ASSISTANT_DRIVER_ID } from "../drivers/homeAssistant/HomeAssistantDriver";
import { buildHomeAssistantDevice } from "../drivers/homeAssistant/haDeviceFactory";
import { ImportedHaEntity, importSupportedEntities } from "../drivers/homeAssistant/haEntityMapping";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { DeviceSetupGuideScreen } from "./DeviceSetupGuideScreen";
import { HOME_ASSISTANT_SETUP_GUIDE } from "./deviceSetupSteps";
import { theme } from "./theme";

export const HOME_ASSISTANT_URL_PLACEHOLDER = "homeassistant.local:8123";

interface AddHomeAssistantScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
}

type Phase =
  | { name: "entering-credentials" }
  | { name: "picking"; entities: ImportedHaEntity[] }
  | { name: "connecting" }
  | { name: "error"; message: string };

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * "Sync from Home Assistant" (ADR-HEARTH-166): the user gives their Home Assistant address and a
 * long-lived access token; Hearth lists the switches, lights, media players and remotes it can
 * drive and adds the one picked (one per visit, like SmartThings, since adding navigates onward).
 */
export function AddHomeAssistantScreen({ driverRegistry, onCancel, onAdded }: AddHomeAssistantScreenProps) {
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [phase, setPhase] = useState<Phase>({ name: "entering-credentials" });
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  if (showSetupGuide) return <DeviceSetupGuideScreen guide={HOME_ASSISTANT_SETUP_GUIDE} onDone={() => setShowSetupGuide(false)} />;

  async function handleFindDevices() {
    setPhase({ name: "connecting" });
    try {
      const states = await new HomeAssistantClient({ baseUrl: url, token: token.trim() }).getStates();
      setPhase({ name: "picking", entities: importSupportedEntities(states) });
    } catch (err) {
      setPhase({ name: "error", message: messageOf(err) });
    }
  }

  async function handleSelect(entity: ImportedHaEntity) {
    const driver = driverRegistry.get(HOME_ASSISTANT_DRIVER_ID);
    if (!driver) {
      setPhase({ name: "error", message: "Home Assistant driver is not registered in this build." });
      return;
    }
    const device = buildHomeAssistantDevice(entity, url, token);
    setPhase({ name: "connecting" });
    try {
      await driver.connect(device);
      onAdded(device);
    } catch (err) {
      setPhase({ name: "error", message: messageOf(err) });
    }
  }

  const busy = phase.name === "connecting";
  const canFind = url.trim().length > 0 && token.trim().length > 0 && !busy;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="home-outline" size={20} color={theme.accentEnd} />
          </View>
          <Text style={styles.title}>Sync from Home Assistant</Text>
        </View>
        <CapabilityButton label="Setup This Device" variant="ghost" onPress={() => setShowSetupGuide(true)} />
        <View style={styles.hintCard}>
          <Text style={styles.hint}>
            In Home Assistant, open your profile (bottom-left), choose Security, scroll to Long-lived access tokens and tap Create Token. Copy it now — Home Assistant only shows it once.
          </Text>
        </View>

        <Text style={styles.label}>Home Assistant address</Text>
        <TextInput style={styles.input} value={url} onChangeText={setUrl} placeholder={HOME_ASSISTANT_URL_PLACEHOLDER} placeholderTextColor={theme.textTertiary} autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} />
        <Text style={styles.label}>Long-lived access token</Text>
        <TextInput style={styles.input} value={token} onChangeText={setToken} placeholder="Paste the token you created" placeholderTextColor={theme.textTertiary} autoCapitalize="none" autoCorrect={false} secureTextEntry editable={!busy} />

        {phase.name === "error" && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
            <Text style={styles.error}>Couldn't connect: {phase.message}</Text>
          </View>
        )}

        {phase.name === "picking" && (
          <View style={localStyles.list}>
            <Text style={styles.label}>Choose a device to add</Text>
            {phase.entities.map((entity) => (
              <CapabilityButton key={entity.entityId} label={`${entity.name} (${entity.domain})`} onPress={() => handleSelect(entity)} containerStyle={localStyles.button} />
            ))}
            {phase.entities.length === 0 && <Text style={styles.hint}>No switches, lights, media players or remotes were found in this Home Assistant.</Text>}
          </View>
        )}

        <View style={styles.row}>
          <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
          <CapabilityButton label={busy ? "Connecting..." : "Find Devices"} variant="accent" onPress={handleFindDevices} disabled={!canFind} />
        </View>
        {busy && <ActivityIndicator color={theme.accentEnd} style={styles.spinner} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const localStyles = StyleSheet.create({
  list: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  button: { width: "100%" },
});
