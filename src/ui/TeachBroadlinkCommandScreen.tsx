import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CapabilityId } from "../core/types/Capability";
import { Device } from "../core/types/Device";
import { BroadlinkClient } from "../drivers/irHub/broadlink/BroadlinkClient";
import { BROADLINK_TEACHABLE_CAPABILITIES } from "../drivers/irHub/broadlink/BroadlinkIrDriver";
import { CAPABILITY_LABELS } from "./CreateSceneScreen";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";
import { addDeviceFormStyles as formStyles } from "./addDeviceFormStyles";
import { StyleSheet } from "react-native";

interface TeachBroadlinkCommandScreenProps {
  device: Device;
  onDone: () => void;
  /** Called after each successful learn — the caller persists it and, unlike every other add/edit screen's onSaved, must NOT navigate away, since teaching is meant to continue across several buttons in one sitting. */
  onCapabilityTaught: (updated: Device) => void;
}

type RowStatus = "idle" | "learning" | "error";

/**
 * Teaches this Broadlink hub one button at a time — point the household's existing remote at the
 * hub and press it while a row is "learning." Unlike every other device-setup screen in this
 * project, there's no fixed pairing flow to walk through once; this screen is meant to be
 * revisited any time a new button is needed; already-taught rows show a checkmark and can be
 * re-taught (e.g. the household re-learns a button on a replacement remote).
 */
export function TeachBroadlinkCommandScreen({ device, onDone, onCapabilityTaught }: TeachBroadlinkCommandScreenProps) {
  const insets = useSafeAreaInsets();
  const [learningCapability, setLearningCapability] = useState<CapabilityId | null>(null);
  const [rowStatus, setRowStatus] = useState<RowStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const ipAddress = typeof device.config?.ipAddress === "string" ? device.config.ipAddress : undefined;
  const codes = (device.config?.codes as Partial<Record<CapabilityId, string>> | undefined) ?? {};

  async function handleTeach(capability: CapabilityId) {
    if (!ipAddress) {
      setRowStatus("error");
      setErrorMessage(`${device.name} is missing an IP address.`);
      return;
    }
    setLearningCapability(capability);
    setRowStatus("learning");
    setErrorMessage("");
    try {
      const code = await new BroadlinkClient().learnCode(ipAddress);
      const alreadyTaught = device.capabilities.includes(capability);
      const updated: Device = {
        ...device,
        capabilities: alreadyTaught ? device.capabilities : [...device.capabilities, capability],
        config: { ...device.config, codes: { ...codes, [capability]: code } },
      };
      onCapabilityTaught(updated);
      setRowStatus("idle");
    } catch (err) {
      setRowStatus("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLearningCapability(null);
    }
  }

  return (
    <View style={formStyles.container}>
      <ScrollView contentContainerStyle={[formStyles.content, { paddingTop: insets.top + theme.spacing.lg }]}>
        <View style={formStyles.headerRow}>
          <View style={formStyles.iconBadge}>
            <Ionicons name="radio-outline" size={20} color={theme.accentEnd} />
          </View>
          <Text style={formStyles.title}>Teach {device.name}</Text>
        </View>
        <View style={formStyles.hintCard}>
          <Text style={formStyles.hint}>
            Point the device's existing remote at the hub, tap a button below, then press the matching button on the
            real remote right away. Already-taught buttons show a checkmark and can be re-taught any time.
          </Text>
        </View>

        {rowStatus === "learning" && (
          <View style={rowStyles.learningCard}>
            <ActivityIndicator color={theme.accentEnd} />
            <Text style={rowStyles.learningText}>
              Point the remote at the hub and press the button for {CAPABILITY_LABELS[learningCapability as CapabilityId] ?? learningCapability} now...
            </Text>
          </View>
        )}

        {rowStatus === "error" && (
          <View style={formStyles.errorCard}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
            <Text style={formStyles.error}>Couldn't learn it: {errorMessage}</Text>
          </View>
        )}

        <View style={rowStyles.list}>
          {BROADLINK_TEACHABLE_CAPABILITIES.map((capability) => {
            const taught = device.capabilities.includes(capability) && typeof codes[capability] === "string";
            return (
              <View key={capability} style={rowStyles.row}>
                <View style={rowStyles.rowLabel}>
                  {taught && <Ionicons name="checkmark-circle" size={16} color={theme.accentEnd} style={rowStyles.checkmark} />}
                  <Text style={rowStyles.rowText}>{CAPABILITY_LABELS[capability] ?? capability}</Text>
                </View>
                <CapabilityButton
                  label={taught ? "Re-teach" : "Teach"}
                  variant={taught ? "ghost" : "accent"}
                  onPress={() => handleTeach(capability)}
                  disabled={rowStatus === "learning"}
                />
              </View>
            );
          })}
        </View>

        <CapabilityButton label="Done" variant="ghost" onPress={onDone} disabled={rowStatus === "learning"} />
      </ScrollView>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  list: { gap: theme.spacing.md, marginBottom: theme.spacing.xl },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  rowLabel: { flexDirection: "row", alignItems: "center" },
  checkmark: { marginRight: theme.spacing.sm },
  rowText: { color: theme.textPrimary, fontSize: theme.type.body },
  learningCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    backgroundColor: theme.surfaceRaised,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  learningText: { color: theme.textPrimary, fontSize: theme.type.label, flex: 1 },
});
