import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { theme } from "./theme";

interface NetworkFailureNoticeProps {
  diagnosis: NetworkFailureDiagnosis;
}

const ICON_SIZE = 16;

/** Explains why the home network or Family Command Center can't be reached and lists what to check, in order (ADR-HEARTH-142). */
export function NetworkFailureNotice({ diagnosis }: NetworkFailureNoticeProps) {
  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Ionicons name="alert-circle-outline" size={ICON_SIZE} color={theme.statusError} />
        <Text style={styles.title}>{diagnosis.message}</Text>
      </View>
      {diagnosis.fixes.map((fix, index) => (
        <Text key={fix} style={styles.fix}>
          {index + 1}. {fix}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.statusErrorSoft,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  title: { color: theme.statusError, fontSize: theme.type.label, fontWeight: "600", flex: 1 },
  fix: { color: theme.textSecondary, fontSize: theme.type.label, lineHeight: 18 },
});
