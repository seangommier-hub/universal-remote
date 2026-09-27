import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "./theme";

interface UpdateBannerProps {
  status: "checking" | "downloaded" | "error" | "up-to-date";
  onApply: () => void;
  onDismiss: () => void;
}

/**
 * Shown when an EAS Update (ADR-HEARTH-084/086) has been checked for and, if available,
 * downloaded — the "push updates for download when it's live" half of Sean's ask, as opposed to
 * the manual "Check for Update" button (DeviceListScreen's header) covering the "test/dev" half.
 * Never auto-applies: a device mid-command shouldn't get yanked into a reload without the user
 * choosing the moment, the same reasoning ADR-HEARTH-017 already applied to reconnects.
 */
export function UpdateBanner({ status, onApply, onDismiss }: UpdateBannerProps) {
  // ADR-HEARTH-180: accessibilityLiveRegion so TalkBack announces a status flip (checking ->
  // ready/error/up-to-date) for someone not looking at the screen when it happens; this banner's
  // own remount per status branch below (each `return`s a fresh tree) is what iOS VoiceOver
  // already treats as new content worth reading, so no extra announceForAccessibility call is
  // needed here the way a banner that only changes its own text in place would need one.
  if (status === "checking") {
    return (
      <View style={styles.banner} accessibilityLiveRegion="polite">
        <ActivityIndicator color={theme.accentEnd} size="small" />
        <Text style={styles.text}>Checking for updates...</Text>
      </View>
    );
  }

  if (status === "up-to-date") {
    return (
      <View style={styles.banner} accessibilityLiveRegion="polite">
        <Ionicons name="checkmark-circle-outline" size={16} color={theme.statusOn} />
        <Text style={styles.text}>Hearth is up to date.</Text>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={styles.banner} accessibilityLiveRegion="assertive">
        <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
        <Text style={styles.text}>Couldn't check for updates.</Text>
        <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Ionicons name="close" size={16} color={theme.textTertiary} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.banner, styles.bannerReady]} accessibilityLiveRegion="polite">
      <Ionicons name="cloud-download-outline" size={16} color={theme.accentEnd} />
      <Text style={styles.text}>An update is ready.</Text>
      <Pressable style={styles.applyButton} onPress={onApply} accessibilityRole="button" accessibilityLabel="Restart to update">
        <Text style={styles.applyLabel}>Restart Now</Text>
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
  bannerReady: { borderColor: theme.accentEnd },
  text: { flex: 1, minWidth: 0, color: theme.textSecondary, fontSize: theme.type.label },
  applyButton: {
    backgroundColor: theme.accentEnd,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  applyLabel: { color: theme.background, fontWeight: "700", fontSize: theme.type.label },
});
