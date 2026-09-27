import { StyleSheet } from "react-native";
import { theme } from "./theme";

/** Shared look for the small centered option modals on the Devices tab (add picker, device actions, set room). */
export const actionModalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#00000099", alignItems: "center", justifyContent: "center", padding: theme.spacing.xl },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: theme.surfaceRaised,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  title: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700", marginBottom: theme.spacing.xs },
  option: { paddingVertical: theme.spacing.md, borderRadius: theme.radius.sm },
  optionPressed: { backgroundColor: theme.surface },
  optionLabel: { color: theme.accentEnd, fontSize: theme.type.body, fontWeight: "600" },
  optionDisabledLabel: { color: theme.textTertiary, fontSize: theme.type.body, fontWeight: "600" },
  destructiveLabel: { color: theme.statusError, fontSize: theme.type.body, fontWeight: "600" },
  cancel: { paddingVertical: theme.spacing.md, marginTop: theme.spacing.xs, borderTopWidth: 1, borderTopColor: theme.border },
  cancelLabel: { color: theme.textSecondary, fontSize: theme.type.body, fontWeight: "600", textAlign: "center" },
});
