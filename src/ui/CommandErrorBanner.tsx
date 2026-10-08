import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { useRemoteScaled } from "./RemoteScaleContext";
import { theme } from "./theme";

const BANNER_ICON_SIZE = 16;

/**
 * Real bug found live (2026-09-22): this used to be gated on isConnected too, which meant
 * a failed powerOn (Wake-on-LAN) attempt — the one command meant to run while disconnected
 * — set commandError but the banner never rendered, so a real failure (no known MAC yet,
 * Family Command Center unreachable) looked identical to a silently-ignored button press.
 */
export function CommandErrorBanner({ message }: { message: string }) {
  const { size, font } = useRemoteScaled();
  const bannerSizing = {
    gap: size(theme.spacing.sm),
    paddingVertical: size(theme.spacing.sm),
    paddingHorizontal: size(theme.spacing.md),
    borderRadius: size(theme.radius.md),
  };
  return (
    <View style={[styles.commandErrorBanner, bannerSizing]} accessibilityLiveRegion="assertive" accessible accessibilityLabel={message}>
      <Ionicons name="alert-circle-outline" size={size(BANNER_ICON_SIZE)} color={theme.statusError} />
      <Text style={[styles.commandErrorText, { fontSize: font(theme.type.label) }]}>{message}</Text>
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
