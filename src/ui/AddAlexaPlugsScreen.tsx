import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { AlexaPlug, listPlugs } from "../drivers/outlet/alexa/AlexaPlugClient";
import { ALEXA_PLUG_DRIVER_ID } from "../drivers/outlet/alexa/AlexaPlugDriver";
import { describeAlexaBridgeFailure } from "../drivers/outlet/alexa/describeAlexaBridgeFailure";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { DeviceSetupGuideScreen } from "./DeviceSetupGuideScreen";
import { ALEXA_SETUP_GUIDE } from "./deviceSetupSteps";
import { theme } from "./theme";

const ALEXA_LABEL = "Alexa";

interface AddAlexaPlugsScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
}

type Phase =
  | { name: "loading" }
  | { name: "picking"; plugs: AlexaPlug[] }
  | { name: "connecting"; plugId: string }
  | { name: "error"; message: string };

/** Plain-language status shown per row — text-first (not just color) so "unreachable" and "unknown" read correctly for a screen reader, not only a colored dot. */
function plugStatusLabel(plug: AlexaPlug): string {
  if (!plug.reachable) return "Unreachable";
  if (plug.on === null) return "Status unknown";
  return plug.on ? "On" : "Off";
}

function plugStatusColor(plug: AlexaPlug): string {
  if (!plug.reachable) return theme.statusError;
  if (plug.on === null) return theme.textTertiary;
  return plug.on ? theme.statusOn : theme.statusOff;
}

/**
 * "Sync from Alexa" (ADR-HEARTH-192) — mirrors AddSmartThingsOutletsScreen.tsx's "list what the
 * household already has" shape: the real pairing step (the one-time Amazon sign-in) happens on the
 * Family Command Center's own Alexa bridge, not in this app, so this screen only lists what the
 * bridge already reports and lets the user pick one plug to add. Unlike SmartThings' plain label
 * list, each row also shows the plug's live state — Amazon's `reachable` and nullable `on` fields
 * are real, distinct signals worth showing before the user commits to adding one. `on: null` is
 * shown as "Status unknown", never as a false "Off".
 */
export function AddAlexaPlugsScreen({ driverRegistry, onCancel, onAdded }: AddAlexaPlugsScreenProps) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);

  // Same hook-ordering requirement AddSmartThingsOutletsScreen.tsx documents (real-device finding,
  // 2026-09-14): the showSetupGuide early return below must come after every hook, this effect
  // included, or a Rules-of-Hooks violation appears the moment showSetupGuide flips to true.
  useEffect(() => {
    let cancelled = false;
    setPhase({ name: "loading" });
    listPlugs()
      .then((plugs) => {
        if (!cancelled) setPhase({ name: "picking", plugs });
      })
      .catch((err) => {
        if (!cancelled) setPhase({ name: "error", message: describeAlexaBridgeFailure(ALEXA_LABEL, err).message });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadCount]);

  if (showSetupGuide) {
    return <DeviceSetupGuideScreen guide={ALEXA_SETUP_GUIDE} onDone={() => setShowSetupGuide(false)} />;
  }

  async function handleSelectPlug(plug: AlexaPlug) {
    const driver = driverRegistry.get(ALEXA_PLUG_DRIVER_ID);
    if (!driver) {
      setPhase({ name: "error", message: "Alexa driver is not registered in this build." });
      return;
    }

    const device: Device = {
      id: `alexa-${plug.id}-${Date.now()}`,
      name: plug.name,
      category: "outlet",
      manufacturer: "Amazon",
      driverId: ALEXA_PLUG_DRIVER_ID,
      capabilities: driver.getCapabilities(),
      config: { plugId: plug.id },
    };

    setPhase({ name: "connecting", plugId: plug.id });
    try {
      await driver.connect(device);
      onAdded(device);
    } catch (err) {
      setPhase({ name: "error", message: describeAlexaBridgeFailure(ALEXA_LABEL, err).message });
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + theme.spacing.lg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="flash-outline" size={20} color={theme.accentEnd} />
          </View>
          <Text style={styles.title}>Sync from Alexa</Text>
        </View>
        <CapabilityButton label="Setup This Device" variant="ghost" onPress={() => setShowSetupGuide(true)} />

        {phase.name === "loading" && (
          <View style={styles.hintCard}>
            <Text style={styles.hint}>Loading plugs from Alexa…</Text>
          </View>
        )}

        {phase.name === "error" && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
            <Text style={styles.error}>{phase.message}</Text>
          </View>
        )}
        {phase.name === "error" && <CapabilityButton label="Try again" variant="accent" onPress={() => setReloadCount((count) => count + 1)} />}

        {phase.name === "picking" && (
          <View style={alexaStyles.plugList}>
            <Text style={styles.label}>Choose a plug</Text>
            {phase.plugs.map((plug) => (
              <View key={plug.id} style={alexaStyles.plugRow}>
                <CapabilityButton label={`${plug.name} — ${plugStatusLabel(plug)}`} onPress={() => handleSelectPlug(plug)} containerStyle={alexaStyles.plugButton} />
                <View style={[alexaStyles.statusDot, { backgroundColor: plugStatusColor(plug) }]} />
              </View>
            ))}
            {phase.plugs.length === 0 && <Text style={styles.hint}>No plugs found yet — tap "Setup This Device" above for the steps.</Text>}
          </View>
        )}
      </ScrollView>

      <View style={styles.row}>
        <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={phase.name === "connecting"} />
      </View>
      {phase.name === "connecting" && <ActivityIndicator color={theme.accentEnd} style={styles.spinner} />}
    </View>
  );
}

const alexaStyles = StyleSheet.create({
  plugList: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  plugRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  plugButton: { flex: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
});
