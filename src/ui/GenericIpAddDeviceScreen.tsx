import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { AddFlowFailedError, AddFlowNeedsFccError, connectBrandDeviceOrThrow } from "../discovery/addDeviceFlow";
import { BrandEntry } from "../discovery/brandRegistry";
import { loadFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import { PairingPrompt, pairingPromptFor } from "../discovery/pairingCopy";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { DeviceSetupGuideScreen } from "./DeviceSetupGuideScreen";
import { setupGuideForBrand } from "./deviceSetupSteps";
import { FCC_REQUIRED_MESSAGE } from "./DiscoveredDeviceRow";
import { PairingProgressCard } from "./PairingProgressCard";
import { theme } from "./theme";
import { usePairingSession } from "./usePairingSession";

interface GenericIpAddDeviceScreenProps {
  brand: BrandEntry;
  driverRegistry: DriverRegistry;
  /** Omitted when this screen is a tab's own landing page (the Feeder tab). */
  onCancel?: () => void;
  onAdded: (device: Device) => void;
  initialIpAddress?: string;
  onOpenFccSetup: () => void;
}

const FALLBACK_INSTRUCTION = "Hearth is reaching the device now.";

/** The card's wording for a brand: its real "look at the TV" prompt, or a plain connecting message. */
function promptForBrand(brand: BrandEntry): PairingPrompt {
  return pairingPromptFor(brand.id) ?? { heading: `Connecting to your ${brand.label}`, instruction: FALLBACK_INSTRUCTION, timeoutMs: null };
}

/** The add screen for every brand whose only input is an IP address (ADR-HEARTH-148); connecting runs through the shared time-boxed pairing card (ADR-HEARTH-155). */
export function GenericIpAddDeviceScreen({ brand, driverRegistry, onCancel, onAdded, initialIpAddress, onOpenFccSetup }: GenericIpAddDeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(brand.defaultName);
  const [ipAddress, setIpAddress] = useState(initialIpAddress ?? "");
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const pairing = usePairingSession();
  const guide = setupGuideForBrand(brand.id);
  const prompt = promptForBrand(brand);

  if (showSetupGuide && guide) return <DeviceSetupGuideScreen guide={guide} onDone={() => setShowSetupGuide(false)} />;

  function handleConnect() {
    const dependencies = { driverRegistry, readReportedName: () => undefined, hasFccConfig: async () => (await loadFamilyCommandCenterConfig()) !== null };
    pairing.start<Device>({
      totalMs: prompt.timeoutMs,
      run: () => connectBrandDeviceOrThrow(dependencies, brand, { id: `${brand.id}-${Date.now()}`, ipAddress: ipAddress.trim(), name }),
      onDone: onAdded,
      discard: (device) => driverRegistry.get(brand.driverId)?.disconnect(device).catch(() => {}),
    });
  }

  const failedError = pairing.state.phase === "failed" ? pairing.state.error : null;
  const needsFcc = failedError instanceof AddFlowNeedsFccError;
  const failure = failedError instanceof AddFlowFailedError ? { title: "Couldn't connect", message: failedError.message, diagnosis: failedError.diagnosis } : null;
  const showCard = pairing.state.phase === "waiting" || pairing.state.phase === "connected" || (pairing.state.phase === "failed" && failure !== null);
  const busy = pairing.state.phase === "waiting" || pairing.state.phase === "connected";

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name={brand.icon} size={20} color={theme.accentEnd} />
          </View>
          <Text style={styles.title} accessibilityRole="header">Add {brand.label}</Text>
        </View>
        <View style={styles.hintCard}>
          <Text style={styles.hint}>{brand.hint}</Text>
          {brand.needsFcc && <Text style={styles.hint}>Requires Family Command Center to be set up first.</Text>}
        </View>
        {guide && <CapabilityButton label="Setup This Device" variant="ghost" onPress={() => setShowSetupGuide(true)} />}

        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={brand.defaultName} placeholderTextColor={theme.textTertiary} editable={!busy} accessibilityLabel="Device name" />

        <Text style={styles.label}>IP address</Text>
        <TextInput
          style={styles.input}
          value={ipAddress}
          onChangeText={setIpAddress}
          placeholder="192.168.1.50"
          placeholderTextColor={theme.textTertiary}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          editable={!busy}
          accessibilityLabel="IP address"
        />

        {needsFcc && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
            <Text style={styles.error}>{FCC_REQUIRED_MESSAGE}</Text>
          </View>
        )}
        {failedError !== null && !needsFcc && failure === null && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
            <Text style={styles.error}>{failedError instanceof Error ? failedError.message : String(failedError)}</Text>
          </View>
        )}
        {showCard && <PairingProgressCard state={pairing.state} prompt={prompt} failure={failure} onRetry={pairing.retry} onCancel={pairing.cancel} />}

        {!showCard && (
          <View style={styles.row}>
            {onCancel && <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} />}
            {needsFcc && <CapabilityButton label="Set up Family Command Center" variant="accent" onPress={onOpenFccSetup} />}
            {!needsFcc && <CapabilityButton label="Connect" variant="accent" onPress={handleConnect} disabled={ipAddress.trim().length === 0} />}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
