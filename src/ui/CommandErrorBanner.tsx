import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { theme } from "./theme";

/**
 * Real bug found live (2026-09-22): this used to be gated on isConnected too, which meant
 * a failed powerOn (Wake-on-LAN) attempt — the one command meant to run while disconnected
 * — set commandError but the banner never rendered, so a real failure (no known MAC yet,
 * Family Command Center unreachable) looked identical to a silently-ignored button press.
 */
export function CommandErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.commandErrorBanner} accessibilityLiveRegion="assertive" accessible accessibilityLabel={message}>
      <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
      <Text style={styles.commandErrorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  commandErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.statusErrorSoft,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  commandErrorText: { color: theme.statusError, fontSize: theme.type.label, flex: 1 },
});
