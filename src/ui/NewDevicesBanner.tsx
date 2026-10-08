import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { newDevicesMessage } from "../discovery/newDeviceAlert";
import { theme } from "./theme";

interface NewDevicesBannerProps {
  /** How many recognized, addable devices the person has not been told about yet. */
  count: number;
  /** Opens the Discover screen, where every add is confirmed one at a time. */
  onReview: () => void;
  onDismiss: () => void;
}

const ICON_SIZE = 16;
const DISMISS_HIT_SLOP = 14;

/**
 * Calm, dismissible one-line notice that new devices turned up on the network (ADR-HEARTH-222),
 * like Home Assistant's "Discovered" notification. It only points at Discover; it never adds anything.
 * Renders nothing when there is nothing new.
 */
export function NewDevicesBanner({ count, onReview, onDismiss }: NewDevicesBannerProps) {
  const message = newDevicesMessage(count);
  // Like the offline banner (ADR-HEARTH-180), this can appear after a background scan with nobody
  // looking, so it is announced explicitly (VoiceOver) as well as marked as a live region (TalkBack).
  useEffect(() => {
    if (count > 0) AccessibilityInfo.announceForAccessibility(message);
  }, [count, message]);
  if (count === 0) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="sparkles-outline" size={ICON_SIZE} color={theme.accentEnd} />
      <Text style={styles.text}>{message}</Text>
      <Pressable style={styles.action} onPress={onReview} accessibilityRole="button" accessibilityLabel="Review new devices">
        <Text style={styles.actionLabel}>Review</Text>
      </Pressable>
      <Pressable onPress={onDismiss} hitSlop={DISMISS_HIT_SLOP} accessibilityRole="button" accessibilityLabel="Dismiss new devices notice">
        <Ionicons name="close" size={ICON_SIZE} color={theme.textTertiary} />
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
