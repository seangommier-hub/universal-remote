import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { describeActivityEntry } from "../core/activityLog/activityLogFormat";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";
import { useRecentActivity } from "./useRecentActivity";

const EMPTY_TEXT = "Nothing yet. Things anyone does with Hearth will show up here.";
const UNAVAILABLE_TEXT = "Couldn't load recent activity. Family Command Center may need its Hearth update.";

/** "Recent activity": what people in the household did lately, newest first (ADR-HEARTH-170). */
export function RecentActivityList() {
  const { state, refresh } = useRecentActivity();
  return (
    <View style={styles.container} accessibilityLabel="Recent activity">
      <Text style={styles.heading}>Recent activity</Text>
      {state.status === "loading" && <ActivityIndicator color={theme.accentEnd} style={styles.spinner} />}
      {state.status === "unavailable" && <Text style={styles.note}>{UNAVAILABLE_TEXT}</Text>}
      {state.status === "ready" && state.entries.length === 0 && <Text style={styles.note}>{EMPTY_TEXT}</Text>}
      {state.status === "ready" &&
        state.entries.map((entry) => (
          <Text key={entry.id} style={[styles.line, !entry.ok && styles.failedLine]} numberOfLines={2}>
            {describeActivityEntry(entry)}
          </Text>
        ))}
      <CapabilityButton label="Refresh" variant="ghost" onPress={refresh} disabled={state.status === "loading"} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing.sm, marginTop: theme.spacing.lg },
  heading: { color: theme.textSecondary, fontSize: theme.type.label, fontWeight: "600" },
  line: { color: theme.textPrimary, fontSize: theme.type.label, lineHeight: 20 },
  failedLine: { color: theme.textTertiary },
  note: { color: theme.textTertiary, fontSize: theme.type.label, lineHeight: 18 },
  spinner: { alignSelf: "flex-start" },
});
