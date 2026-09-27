import { StyleSheet, Text, View } from "react-native";
import { ConfirmationPrompt } from "../../core/engine/commandConfirmation";
import { CapabilityButton } from "../CapabilityButton";
import { theme } from "../theme";

interface ConfirmCardProps {
  prompt: ConfirmationPrompt;
  onConfirm: () => void;
  onCancel: () => void;
}

/** An in-screen "are you sure?" (not an OS alert, so it works the same on iOS, Android and the web harness). */
export function ConfirmCard({ prompt, onConfirm, onCancel }: ConfirmCardProps) {
  return (
    <View style={styles.card} accessibilityRole="alert">
      <Text style={styles.title}>{prompt.title}</Text>
      <Text style={styles.message}>{prompt.message}</Text>
      <View style={styles.row}>
        <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} />
        <CapabilityButton label={prompt.confirmLabel} variant="accent" onPress={onConfirm} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.statusErrorSoft, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.statusError, padding: theme.spacing.lg, gap: theme.spacing.sm },
  title: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700" },
  message: { color: theme.textSecondary, fontSize: theme.type.label },
  row: { flexDirection: "row", justifyContent: "flex-end", gap: theme.spacing.md },
});
