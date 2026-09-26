import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { ACTION_LABEL, AdviceAction, adviceForEmptyScan } from "../discovery/discoverEmptyAdvice";
import { DiscoverScreenState } from "../discovery/discoverySections";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

const ICON_SIZE = 36;

export type EmptyKind = Exclude<DiscoverScreenState, "list">;

interface DiscoverEmptyStateProps {
  kind: EmptyKind;
  failure: NetworkFailureDiagnosis | null;
  /** Shown under the spinner while the first scan runs, e.g. "Scanning... " with a patience note. */
  scanningText: string;
  onRetry: () => void;
  /** Opens Family Command Center setup. */
  onOpenSettings: () => void;
  /** Opens the phone's own Settings page for Hearth (Local Network permission lives there). */
  onOpenPhoneSettings: () => void;
}

/** The one message shown when there is no list: it says why (permission, Wi-Fi, Pi) and puts a button on the likeliest fix (ADR-HEARTH-167). */
export function DiscoverEmptyState({ kind, failure, scanningText, onRetry, onOpenSettings, onOpenPhoneSettings }: DiscoverEmptyStateProps) {
  if (kind === "scanning") {
    return (
      <View style={styles.centered} accessibilityRole="progressbar" accessibilityLabel="Scanning your network">
        <ActivityIndicator color={theme.accentEnd} size="large" />
        <Text style={styles.body}>{scanningText}</Text>
      </View>
    );
  }
  const advice = adviceForEmptyScan(kind, failure);
  const handlers: Record<AdviceAction, () => void> = { "open-phone-settings": onOpenPhoneSettings, "scan-again": onRetry, "setup-fcc": onOpenSettings };
  return (
    <ScrollView contentContainerStyle={styles.centered}>
      <Ionicons name={advice.icon} size={ICON_SIZE} color={theme.textTertiary} />
      <Text style={styles.title} accessibilityRole="header">
        {advice.title}
      </Text>
      {advice.body && <Text style={styles.body}>{advice.body}</Text>}
      {advice.reasons.length > 0 && (
        <View style={styles.reasons}>
          {advice.reasons.map((reason) => (
            <Text key={reason} style={styles.reason}>
              {"•"} {reason}
            </Text>
          ))}
        </View>
      )}
      <View style={styles.actions}>
        {advice.actions.map((action, index) => (
          <CapabilityButton key={action} label={ACTION_LABEL[action]} variant={index === 0 ? "accent" : "ghost"} onPress={handlers[action]} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md, paddingVertical: theme.spacing.xxl },
  title: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700", textAlign: "center" },
  body: { color: theme.textSecondary, fontSize: theme.type.label, textAlign: "center", paddingHorizontal: theme.spacing.xl },
  reasons: { alignSelf: "stretch", gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md },
  reason: { color: theme.textSecondary, fontSize: theme.type.label, lineHeight: 20 },
  actions: { alignItems: "center", gap: theme.spacing.sm, marginTop: theme.spacing.sm },
});
