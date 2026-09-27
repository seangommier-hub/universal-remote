import { StyleSheet } from "react-native";
import { theme } from "../theme";

/** Card and label styles shared by every control group on the entity screen. */
export const entityControlStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  cardLabel: { color: theme.textSecondary, fontSize: theme.type.label, fontWeight: "600" },
  bigValue: { color: theme.textPrimary, fontSize: theme.type.display, fontWeight: "700" },
  hint: { color: theme.textSecondary, fontSize: theme.type.label },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.spacing.lg },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
});
