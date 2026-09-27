import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "./theme";
import { useTokenUpgradeBanner } from "./useTokenUpgradeBanner";

interface TokenUpgradeBannerProps {
  fccConfigured: boolean;
  /** Opens the invite-code join screen (ADR-HEARTH-149) -- the same "Re-pair" action never runs on its own. */
  onJoinWithCode: () => void;
}

/** One-time, dismissible nudge that a fresh pairing gets this phone its own token instead of the shared household one (ADR-HEARTH-181, phase 1). Renders nothing once dismissed or once this phone already has a personal token. */
export function TokenUpgradeBanner({ fccConfigured, onJoinWithCode }: TokenUpgradeBannerProps) {
  const { visible, dismiss } = useTokenUpgradeBanner(fccConfigured);
  if (!visible) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Ionicons name="key-outline" size={16} color={theme.textTertiary} />
      <Text style={styles.text}>A fresh pairing gives this phone its own household token, instead of sharing one with everyone else.</Text>
      <Pressable style={styles.action} onPress={onJoinWithCode} accessibilityRole="button" accessibilityLabel="Re-pair for a personal token">
        <Text style={styles.actionLabel}>Re-pair</Text>
      </Pressable>
      <Pressable onPress={dismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Ionicons name="close" size={16} color={theme.textTertiary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  text: { flex: 1, minWidth: 0, color: theme.textSecondary, fontSize: theme.type.label },
  action: { backgroundColor: theme.surfaceRaised, borderRadius: theme.radius.sm, paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.md },
  actionLabel: { color: theme.accentEnd, fontWeight: "700", fontSize: theme.type.label },
});
