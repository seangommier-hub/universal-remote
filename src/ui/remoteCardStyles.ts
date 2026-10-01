import { StyleSheet } from "react-native";
import { DPAD_HEIGHT } from "./dpadLayout";
import { theme } from "./theme";

/** Shared card/rocker style tokens used by several of the remote screen's extracted cards — identical values to what each card used inline before the split, just not redeclared per file. */
export const remoteCardStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  // Real-device ask (2026-09-10): "that card needs better spacing" — more generous padding than
  // the base `card` for the utility row specifically, since a sparse row of a few icon+caption
  // chips reads as cramped at the same padding a denser card (the hub, the keypad) uses well.
  // Real-device ask (2026-09-11): "add a little padding to the bottom under the menu that has
  // mute back home etc" — this card is the last one on the "remote" tab, so its own marginBottom
  // is what actually controls the gap between it and the bottom of the scrollable content
  // (the ScrollView's own contentContainerStyle padding applies equally above the first card too,
  // not extra room specific to this one).
  // ADR-HEARTH-157: measured 22px of overflow on the LG remote (4 inputs, iPhone 17 frame) - the "next levers" ADR-HEARTH-135 named: streaming/input card padding, plus the utility card bottom margin that the scroll content padding already covers.
  compactCard: { padding: theme.spacing.sm },
  cardLabel: {
    color: theme.textSecondary,
    fontSize: theme.type.label,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // Real-device ask (2026-09-10): "fix the navigation of the up down arrows... to be more
  // neatly oriented" — see dpadLayout.ts's ROCKER_WIDTH comment. Same surface/border treatment as
  // DpadCluster's own `dpad` style so the Vol/Ch columns read as matching discs beside the d-pad's
  // own, not two differently-styled control types next to each other. paddingVertical keeps the
  // Up/Down buttons from touching the pill's own rounded caps.
  rockerColumn: {
    alignItems: "center",
    justifyContent: "space-between",
    height: DPAD_HEIGHT,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.border,
  },
  rockerColumnLabel: {
    color: theme.textTertiary,
    fontSize: theme.type.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
