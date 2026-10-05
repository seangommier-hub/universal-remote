import { StyleSheet, Text, View } from "react-native";
import { ConnectivityMode } from "../core/network/fccConnectivity";
import { theme } from "./theme";

const BADGE_LABEL: Record<Exclude<ConnectivityMode, "unknown">, string> = { home: "Home", away: "Away" };

/** Small "Home" / "Away" badge for the Devices header (ADR-HEARTH-163); renders nothing while the mode is unknown. */
export function ConnectivityBadge({ mode }: { mode: ConnectivityMode }) {
  if (mode === "unknown") return null;
  const isHome = mode === "home";
  return (
    <View style={[styles.badge, isHome ? styles.home : styles.away]} accessibilityLabel={isHome ? "On the home network" : "Away from home, using the relay"}>
      <Text style={styles.label}>{BADGE_LABEL[mode]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: theme.radius.full, paddingVertical: 2, paddingHorizontal: theme.spacing.sm, flexShrink: 0 },
  home: { backgroundColor: theme.statusOnSoft },
  away: { backgroundColor: theme.surfaceRaised },
  label: { color: theme.textSecondary, fontSize: theme.type.caption, fontWeight: "600" },
});
