import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { logger } from "../core/logging/logger";
import { Device } from "../core/types/Device";
import { demoHaSyncCandidates } from "../demo/demoHomeAssistant";
import { HOME_ASSISTANT_DRIVER_ID } from "../drivers/homeAssistant/HomeAssistantDriver";
import { buildHomeAssistantDevice } from "../drivers/homeAssistant/haDeviceFactory";
import { HaImportCandidate, buildImportCandidates, roomForCandidate } from "../drivers/homeAssistant/haImportCandidates";
import { loadImportData } from "../drivers/homeAssistant/haImportData";
import { listHaInstances } from "../drivers/homeAssistant/haInstanceRegistry";
import { saveHaInstance } from "../drivers/homeAssistant/haInstanceStore";
import { prepareHaImport } from "../runtime/haBulkImport";
import { applyImportedRooms } from "../runtime/haImportRooms";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { DeviceSetupGuideScreen } from "./DeviceSetupGuideScreen";
import { HomeAssistantSyncScreen } from "./HomeAssistantSyncScreen";
import { HOME_ASSISTANT_SETUP_GUIDE } from "./deviceSetupSteps";
import { theme } from "./theme";

const LOG_SCOPE = "AddHomeAssistantScreen";
export const HOME_ASSISTANT_URL_PLACEHOLDER = "homeassistant.local:8123";

interface AddHomeAssistantScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  /** Devices already in Hearth, so a later sync offers only the new Home Assistant entities. */
  existingDevices?: Device[];
  /** Adds several devices at once and returns them as stored; when omitted only the one-at-a-time list is offered. */
  onImported?: (devices: Device[]) => Device[];
}

type Phase =
  | { name: "entering-credentials" }
  | { name: "picking"; candidates: HaImportCandidate[]; areasUnavailable: boolean }
  | { name: "syncing"; candidates: HaImportCandidate[]; areasUnavailable: boolean; importing: boolean; error: string | null }
  | { name: "connecting" }
  | { name: "error"; message: string };

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function addedEntityIds(devices: Device[] | undefined): Set<string> {
  const ids = (devices ?? []).filter((d) => d.driverId === HOME_ASSISTANT_DRIVER_ID).map((d) => d.config?.entityId);
  return new Set(ids.filter((id): id is string => typeof id === "string"));
}

/**
 * "Sync from Home Assistant" (ADR-HEARTH-166, ADR-HEARTH-175): the user gives their Home Assistant address and a
 * long-lived access token once; Hearth lists what it can drive, grouped by Home Assistant area, and imports them
 * all in one go (areas become rooms), or adds a single entity from the plain list.
 */
export function AddHomeAssistantScreen({ driverRegistry, onCancel, onAdded, existingDevices, onImported }: AddHomeAssistantScreenProps) {
  const insets = useSafeAreaInsets();
  const saved = listHaInstances()[0];
  const [url, setUrl] = useState(saved?.baseUrl ?? "");
  const [token, setToken] = useState(saved?.token ?? "");
  const [phase, setPhase] = useState<Phase>(() => {
    const demo = demoHaSyncCandidates();
    return demo ? { name: "syncing", candidates: demo, areasUnavailable: false, importing: false, error: null } : { name: "entering-credentials" };
  });
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  if (showSetupGuide) return <DeviceSetupGuideScreen guide={HOME_ASSISTANT_SETUP_GUIDE} onDone={() => setShowSetupGuide(false)} />;

  async function handleFindDevices() {
    setPhase({ name: "connecting" });
    try {
      const { states, registries } = await loadImportData(url, token.trim());
      const candidates = buildImportCandidates(states, registries, addedEntityIds(existingDevices));
      setPhase({ name: "picking", candidates, areasUnavailable: registries === null });
    } catch (err) {
      setPhase({ name: "error", message: messageOf(err) });
    }
  }

  async function handleSelect(candidate: HaImportCandidate) {
    const driver = driverRegistry.get(HOME_ASSISTANT_DRIVER_ID);
    if (!driver) {
      setPhase({ name: "error", message: "Home Assistant driver is not registered in this build." });
      return;
    }
    setPhase({ name: "connecting" });
    try {
      const instance = await saveHaInstance(url, token);
      const device = buildHomeAssistantDevice(candidate, instance);
      await driver.connect(device);
      await applyImportedRooms({ [device.id]: roomForCandidate(candidate) }).catch((err) => logger.warn(LOG_SCOPE, "could not set the room from the Home Assistant area", { error: messageOf(err) }));
      onAdded(device);
    } catch (err) {
      setPhase({ name: "error", message: messageOf(err) });
    }
  }

  async function handleImport(chosen: HaImportCandidate[], syncing: Extract<Phase, { name: "syncing" }>) {
    if (!onImported) return;
    setPhase({ ...syncing, importing: true, error: null });
    try {
      const { devices } = await prepareHaImport(chosen, url, token);
      const stored = onImported(devices);
      const driver = driverRegistry.get(HOME_ASSISTANT_DRIVER_ID);
      stored.forEach((device) => void driver?.connect(device).catch((err) => logger.warn(LOG_SCOPE, `${device.name} did not connect yet; it will keep retrying`, { error: messageOf(err) })));
    } catch (err) {
      setPhase({ ...syncing, importing: false, error: messageOf(err) });
    }
  }

  if (phase.name === "syncing") {
    const syncing = phase;
    return (
      <HomeAssistantSyncScreen
        candidates={syncing.candidates}
        areasUnavailable={syncing.areasUnavailable}
        busy={syncing.importing}
        error={syncing.error}
        onImport={(chosen) => void handleImport(chosen, syncing)}
        onBack={() => setPhase({ name: "picking", candidates: syncing.candidates, areasUnavailable: syncing.areasUnavailable })}
      />
    );
  }

  const busy = phase.name === "connecting";
  const canFind = url.trim().length > 0 && token.trim().length > 0 && !busy;
  const newCount = phase.name === "picking" ? phase.candidates.filter((c) => !c.alreadyAdded).length : 0;

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
            {onImported && (
              <CapabilityButton
                label={newCount > 0 ? `Import ${newCount} new ${newCount === 1 ? "device" : "devices"} by area` : "Review synced devices"}
                variant="accent"
                onPress={() => setPhase({ name: "syncing", candidates: phase.candidates, areasUnavailable: phase.areasUnavailable, importing: false, error: null })}
                containerStyle={localStyles.button}
              />
            )}
            <Text style={styles.label}>{onImported ? "Or add just one device" : "Choose a device to add"}</Text>
            {phase.candidates.filter((c) => !c.alreadyAdded).map((candidate) => (
              <CapabilityButton key={candidate.entityId} label={`${candidate.name} (${candidate.domain})`} onPress={() => handleSelect(candidate)} containerStyle={localStyles.button} />
            ))}
            {newCount === 0 && <Text style={styles.hint}>No new switches, lights, media players or remotes were found in this Home Assistant.</Text>}
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
