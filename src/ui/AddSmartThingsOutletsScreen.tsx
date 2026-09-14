import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { SmartThingsOutlet, listOutlets } from "../drivers/outlet/smartthings/SmartThingsClient";
import { SMARTTHINGS_OUTLET_DRIVER_ID } from "../drivers/outlet/smartthings/SmartThingsOutletDriver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { DeviceSetupGuideScreen } from "./DeviceSetupGuideScreen";
import { SMARTTHINGS_SETUP_GUIDE } from "./deviceSetupSteps";
import { theme } from "./theme";

interface AddSmartThingsOutletsScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
}

type Phase =
  | { name: "loading" }
  | { name: "picking"; outlets: SmartThingsOutlet[] }
  | { name: "connecting"; outletId: string }
  | { name: "error"; message: string };

/**
 * "Sync from SmartThings" (ADR-HEARTH-042, course-corrected 2026-09-11) — unlike every other Add
 * screen, there is no pairing step here at all: the household already granted Hearth access to
 * specific devices when installing "Hearth" in the SmartThings mobile app itself (that's where the
 * real pairing UI lives now, a SmartThings-rendered config page, not anything in this codebase).
 * This screen just lists what the Family Command Center already knows about — reached through
 * SmartThingsClient.ts's FCC proxy calls, using the household's existing Family Command Center
 * pairing, not a separate SmartThings credential — and lets the user pick one outlet to add as a
 * Hearth device, the same "one device per visit" shape every other Add screen uses (see
 * AddHueDeviceScreen's light picker), not a bulk-add.
 */
export function AddSmartThingsOutletsScreen({ driverRegistry, onCancel, onAdded }: AddSmartThingsOutletsScreenProps) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  // Real-hardware finding (2026-09-14): the early return for showSetupGuide MUST come after every
  // hook in this component, not just after the useState calls — unlike the simpler Add*Screens
  // this pattern was copied from (Sony/Samsung/LG/Roku), this one also calls useEffect below.
  // Returning before it meant this component rendered a different hook count on the render where
  // showSetupGuide flips to true than on every other render -- a real Rules-of-Hooks violation
  // ("Rendered fewer hooks than expected"), caught live on the emulator, not by inspection.
  useEffect(() => {
    let cancelled = false;
    listOutlets()
      .then((outlets) => {
        if (!cancelled) setPhase({ name: "picking", outlets });
      })
      .catch((err) => {
        if (!cancelled) setPhase({ name: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (showSetupGuide) {
    return <DeviceSetupGuideScreen guide={SMARTTHINGS_SETUP_GUIDE} onDone={() => setShowSetupGuide(false)} />;
  }

  async function handleSelectOutlet(outlet: SmartThingsOutlet) {
    const driver = driverRegistry.get(SMARTTHINGS_OUTLET_DRIVER_ID);
    if (!driver) {
      setPhase({ name: "error", message: "SmartThings driver is not registered in this build." });
      return;
    }

    const device: Device = {
      id: `smartthings-${outlet.id}-${Date.now()}`,
      name: outlet.label,
      category: "outlet",
      manufacturer: "SmartThings",
      driverId: SMARTTHINGS_OUTLET_DRIVER_ID,
      capabilities: driver.getCapabilities(),
      config: { deviceId: outlet.id },
    };

    setPhase({ name: "connecting", outletId: outlet.id });
    try {
      await driver.connect(device);
      onAdded(device);
    } catch (err) {
      setPhase({ name: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + theme.spacing.lg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="flash-outline" size={20} color={theme.accentEnd} />
          </View>
          <Text style={styles.title}>Sync from SmartThings</Text>
        </View>
        <CapabilityButton label="Setup This Device" variant="ghost" onPress={() => setShowSetupGuide(true)} />

        {phase.name === "loading" && (
          <View style={styles.hintCard}>
            <Text style={styles.hint}>Loading outlets from SmartThings…</Text>
          </View>
        )}

        {phase.name === "error" && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
            <Text style={styles.error}>Couldn't load outlets: {phase.message}</Text>
          </View>
        )}

        {phase.name === "picking" && (
          <View style={smartThingsStyles.outletList}>
            <Text style={styles.label}>Choose an outlet</Text>
            {phase.outlets.map((outlet) => (
              <CapabilityButton
                key={outlet.id}
                label={outlet.label}
                onPress={() => handleSelectOutlet(outlet)}
                containerStyle={smartThingsStyles.outletButton}
              />
            ))}
            {phase.outlets.length === 0 && (
              <Text style={styles.hint}>No outlets found yet — tap "Setup This Device" above for the steps.</Text>
            )}
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

const smartThingsStyles = StyleSheet.create({
  outletList: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  outletButton: { width: "100%" },
});
