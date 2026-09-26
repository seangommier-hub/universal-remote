import { Text, View } from "react-native";
import { describeRun } from "../core/activities/activityRunReport";
import { ActivityRun } from "../core/types/Activity";
import { theme } from "./theme";

const VISIBLE_RUNS = 3;

/** A compact "who ran what, and did it work" list of the household's most recent runs, hidden when there are none. */
export function ActivityHistoryList({ runs }: { runs: ActivityRun[] }) {
  if (runs.length === 0) return null;
  return (
    <View style={listStyles.container} accessibilityLabel="Recent activity runs">
      {runs.slice(0, VISIBLE_RUNS).map((run) => (
        <Text key={run.runId} style={listStyles.line} numberOfLines={1}>
          {describeRun(run)}
        </Text>
      ))}
    </View>
  );
}

const listStyles = {
  container: { gap: 2, paddingBottom: theme.spacing.md },
  line: { color: theme.textTertiary, fontSize: theme.type.caption },
};
