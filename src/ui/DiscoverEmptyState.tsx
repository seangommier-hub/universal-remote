import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { DiscoverScreenState } from "../discovery/discoverySections";
import { CapabilityButton } from "./CapabilityButton";
import { NetworkFailureNotice } from "./NetworkFailureNotice";
import { theme } from "./theme";

const ICON_SIZE = 36;

export type EmptyKind = Exclude<DiscoverScreenState, "list">;

interface DiscoverEmptyStateProps {
  kind: EmptyKind;
  failure: NetworkFailureDiagnosis | null;
  onRetry: () => void;
  onOpenSettings: () => void;
}

const COPY: Record<Exclude<EmptyKind, "scanning">, { icon: keyof typeof Ionicons.glyphMap; title: string; body: string | null }> = {
  "all-added": { icon: "checkmark-circle-outline", title: "Nothing new found", body: "Your devices are all added." },
  "none-found": { icon: "search-outline", title: "Nothing found right now", body: "Make sure your devices are on and this phone is on your home Wi-Fi." },
  unreachable: { icon: "cloud-offline-outline", title: "Can't reach your home network", body: null },
  "not-configured": { icon: "home-outline", title: "Set up Family Command Center first", body: "It scans your network so Hearth can find every device." },
};

/** The one calm message shown when there is no list: scanning, all added, nothing found, unreachable, or not set up. */
export function DiscoverEmptyState({ kind, failure, onRetry, onOpenSettings }: DiscoverEmptyStateProps) {
  if (kind === "scanning") {
    return (
      <View style={styles.centered} accessibilityRole="progressbar" accessibilityLabel="Scanning your network">
        <ActivityIndicator color={theme.accentEnd} size="large" />
        <Text style={styles.body}>Scanning your network...</Text>
      </View>
    );
  }
  const copy = COPY[kind];
  return (
    <View style={styles.centered}>
      <Ionicons name={copy.icon} size={ICON_SIZE} color={theme.textTertiary} />
      <Text style={styles.title} accessibilityRole="header">
        {copy.title}
      </Text>
      {copy.body && <Text style={styles.body}>{copy.body}</Text>}
      {kind === "unreachable" && failure && <NetworkFailureNotice diagnosis={failure} />}
      {kind === "not-configured" ? (
        <CapabilityButton label="Set up Family Command Center" variant="accent" onPress={onOpenSettings} />
      ) : (
        <CapabilityButton label="Scan again" variant="accent" onPress={onRetry} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md, paddingVertical: theme.spacing.xxl },
  title: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700", textAlign: "center" },
  body: { color: theme.textSecondary, fontSize: theme.type.label, textAlign: "center", paddingHorizontal: theme.spacing.xl },
});
