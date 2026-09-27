import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Device } from "../core/types/Device";
import { loadFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import { HOME_ASSISTANT_DRIVER_ID } from "../drivers/homeAssistant/HomeAssistantDriver";
import { SWITCHBOT_VACUUM_DRIVER_ID } from "../drivers/vacuum/switchbot/SwitchBotVacuumDriver";
import { buildPrivacyEntries, nothingElseLeaves } from "./privacyDisclosure";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface WhatLeavesYourHouseScreenProps {
  devices: Device[];
  onDone: () => void;
}

/**
 * Plain-language "what leaves your house" disclosure (ADR-HEARTH-162 Track B item 12,
 * ADR-HEARTH-186). Every line here is traceable to real code, not a marketing claim — see
 * ADR-HEARTH-186 for the audit each sentence is drawn from, and privacyDisclosure.ts for the
 * (unit-tested) logic deciding which lines apply. Reached from Family Command Center settings.
 */
export function WhatLeavesYourHouseScreen({ devices, onDone }: WhatLeavesYourHouseScreenProps) {
  const insets = useSafeAreaInsets();
  const [hasAwayAddress, setHasAwayAddress] = useState(false);

  useEffect(() => {
    loadFamilyCommandCenterConfig().then((config) => setHasAwayAddress(Boolean(config?.publicBaseUrl)));
  }, []);

  const hasHomeAssistant = devices.some((device) => device.driverId === HOME_ASSISTANT_DRIVER_ID);
  const hasSwitchBot = devices.some((device) => device.driverId === SWITCHBOT_VACUUM_DRIVER_ID);
  const entries = buildPrivacyEntries(hasAwayAddress, hasHomeAssistant, hasSwitchBot);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]}>
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="eye-outline" size={20} color={theme.accentEnd} />
          </View>
          <Text style={styles.title}>What leaves your house</Text>
        </View>
        <Text style={styles.intro}>
          An honest, plain-language list of what actually leaves your home network when you use Hearth, and where it
          goes.
        </Text>
        {entries.map((entry, index) => (
          <View key={index} style={styles.entryRow}>
            <Ionicons name={entry.icon} size={18} color={theme.accentEnd} style={styles.entryIcon} />
            <Text style={styles.entryText}>{entry.text}</Text>
          </View>
        ))}
        {nothingElseLeaves(hasHomeAssistant, hasSwitchBot) && <Text style={styles.closing}>Nothing else leaves this house.</Text>}
      </ScrollView>
      <View style={styles.footer}>
        <CapabilityButton label="Done" variant="accent" icon="checkmark" onPress={onDone} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { padding: theme.spacing.xl, gap: theme.spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginBottom: theme.spacing.xs },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: theme.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: theme.textPrimary, fontSize: theme.type.title, fontWeight: "700" },
  intro: { color: theme.textSecondary, fontSize: theme.type.body, lineHeight: 20, marginBottom: theme.spacing.sm },
  entryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.md,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: theme.spacing.md,
  },
  entryIcon: { marginTop: 2 },
  entryText: { flex: 1, color: theme.textPrimary, fontSize: theme.type.body, lineHeight: 21 },
  closing: {
    color: theme.textSecondary,
    fontSize: theme.type.label,
    fontWeight: "600",
    textAlign: "center",
    marginTop: theme.spacing.md,
  },
  footer: { padding: theme.spacing.xl, borderTopWidth: 1, borderTopColor: theme.borderSubtle },
});
