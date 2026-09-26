import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { Device } from "../core/types/Device";
import { connectBrandDevice } from "../discovery/addDeviceFlow";
import { BrandEntry } from "../discovery/brandRegistry";
import { setNameSource } from "../discovery/deviceNameSource";
import { loadFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import { identifyDeviceByIp } from "../discovery/identifyDevice";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { DeviceSetupGuideScreen } from "./DeviceSetupGuideScreen";
import { setupGuideForBrand } from "./deviceSetupSteps";
import { FCC_REQUIRED_MESSAGE } from "./DiscoveredDeviceRow";
import { NetworkFailureNotice } from "./NetworkFailureNotice";
import { theme } from "./theme";
import { useIdentifiedName } from "./useIdentifiedName";

interface GenericIpAddDeviceScreenProps {
  brand: BrandEntry;
  driverRegistry: DriverRegistry;
  /** Omitted when this screen is a tab's own landing page (the Feeder tab). */
  onCancel?: () => void;
  onAdded: (device: Device) => void;
  initialIpAddress?: string;
  onOpenFccSetup: () => void;
}

type Status = { name: "idle" } | { name: "connecting" } | { name: "needs-fcc" } | { name: "error"; message: string; diagnosis: NetworkFailureDiagnosis | null };

/** The one add screen for every brand whose only input is an IP address (ADR-HEARTH-148), driven entirely by the brand registry. */
export function GenericIpAddDeviceScreen({ brand, driverRegistry, onCancel, onAdded, initialIpAddress, onOpenFccSetup }: GenericIpAddDeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [ipAddress, setIpAddress] = useState(initialIpAddress ?? "");
  const identified = useIdentifiedName(ipAddress, brand.id);
  const [status, setStatus] = useState<Status>({ name: "idle" });
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const guide = setupGuideForBrand(brand.id);

  if (showSetupGuide && guide) return <DeviceSetupGuideScreen guide={guide} onDone={() => setShowSetupGuide(false)} />;

  async function handleConnect() {
    setStatus({ name: "connecting" });
    const outcome = await connectBrandDevice(
      { driverRegistry, readReportedName: () => undefined, hasFccConfig: async () => (await loadFamilyCommandCenterConfig()) !== null, identify: identifyDeviceByIp, recordNameSource: (id, source) => void setNameSource(id, source) },
      brand,
      { id: `${brand.id}-${Date.now()}`, ipAddress: ipAddress.trim(), name: name.trim() || undefined }
    );
    if (outcome.kind === "added") return onAdded(outcome.device);
    if (outcome.kind === "needs-fcc") return setStatus({ name: "needs-fcc" });
    if (outcome.kind === "failed") return setStatus({ name: "error", message: outcome.message, diagnosis: outcome.diagnosis });
    setStatus({ name: "idle" });
  }

  const connecting = status.name === "connecting";
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name={brand.icon} size={20} color={theme.accentEnd} />
          </View>
          <Text style={styles.title}>Add {brand.label}</Text>
        </View>
        <View style={styles.hintCard}>
          <Text style={styles.hint}>{brand.hint}</Text>
          {brand.needsFcc && <Text style={styles.hint}>Requires Family Command Center to be set up first.</Text>}
        </View>
        {guide && <CapabilityButton label="Setup This Device" variant="ghost" onPress={() => setShowSetupGuide(true)} />}

        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={identified.name ?? brand.defaultName} placeholderTextColor={theme.textTertiary} />

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

        {status.name === "needs-fcc" && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
            <Text style={styles.error}>{FCC_REQUIRED_MESSAGE}</Text>
          </View>
        )}
        {status.name === "error" && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
            <Text style={styles.error}>{status.message}</Text>
          </View>
        )}
        {status.name === "error" && status.diagnosis && <NetworkFailureNotice diagnosis={status.diagnosis} />}

        <View style={styles.row}>
          {onCancel && <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={connecting} />}
          {status.name === "needs-fcc" && <CapabilityButton label="Set up Family Command Center" variant="accent" onPress={onOpenFccSetup} />}
          {status.name !== "needs-fcc" && (
            <CapabilityButton label={connecting ? "Connecting..." : "Connect"} variant="accent" onPress={handleConnect} disabled={ipAddress.trim().length === 0 || connecting} />
          )}
        </View>
        {connecting && <ActivityIndicator color={theme.accentEnd} style={styles.spinner} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
