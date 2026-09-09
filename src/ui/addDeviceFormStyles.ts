import { StyleSheet } from "react-native";
import { theme } from "./theme";

/**
 * Shared visual pattern for the four Add*DeviceScreen forms (Sony/Samsung/LG/Roku). These
 * screens intentionally stay as four separate components (different fields, pairing-wait
 * copy, and warnings per ADR-HEARTH-004/005/006/007) — this file only centralizes the *look*
 * so a style tweak doesn't need to be copy-pasted four times. Not a component merge.
 */
export const addDeviceFormStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { padding: theme.spacing.xl, paddingTop: 64, gap: theme.spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginBottom: 4 },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: theme.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: theme.textPrimary, fontSize: theme.type.title, fontWeight: "700" },
  hintCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  hint: { color: theme.textSecondary, fontSize: theme.type.label, lineHeight: 18 },
  label: { color: theme.textSecondary, fontSize: theme.type.label, fontWeight: "600", marginTop: theme.spacing.sm },
  input: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    color: theme.textPrimary,
    fontSize: theme.type.body,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.statusErrorSoft,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  error: { color: theme.statusError, fontSize: theme.type.label, flex: 1 },
  row: { flexDirection: "row", gap: theme.spacing.md, justifyContent: "center", marginTop: theme.spacing.xl },
  spinner: { marginTop: theme.spacing.lg },
});
