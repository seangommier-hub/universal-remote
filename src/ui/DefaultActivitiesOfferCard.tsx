import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface DefaultActivitiesOfferCardProps {
  onCreate: () => void;
  onDismiss: () => void;
}

/** One-time, dismissible offer to generate "All On" / "All Off" Activities for this household's devices (ADR-HEARTH-200, roadmap item 1 from ADR-HEARTH-199) -- the baseline every hub-based competitor ships that Hearth doesn't yet build on its own. */
export function DefaultActivitiesOfferCard({ onCreate, onDismiss }: DefaultActivitiesOfferCardProps) {
  return (
    <View style={styles.card} accessibilityRole="summary">
      <Pressable style={styles.dismiss} onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Ionicons name="close" size={16} color={theme.textTertiary} />
      </Pressable>
      <Ionicons name="flash-outline" size={24} color={theme.accentEnd} />
      <Text style={styles.title}>Set up All On / All Off?</Text>
      <Text style={styles.body}>Create two Activities that turn every capable device on or off in one tap.</Text>
      <CapabilityButton label="Create Activities" variant="accent" onPress={onCreate} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: theme.spacing.md,
  },
  dismiss: { position: "absolute", top: theme.spacing.sm, right: theme.spacing.sm },
  title: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "600" },
  body: { color: theme.textSecondary, fontSize: theme.type.label, textAlign: "center" },
});
