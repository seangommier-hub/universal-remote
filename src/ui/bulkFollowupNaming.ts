// ADR-HEARTH-195: the inline-rename rule for the post-"Add all" summary card — trimmed, non-empty,
// and only when it actually differs, the same rule RenameDeviceScreen already uses.

/** The name to commit for a rename, or null when the draft is blank or unchanged (nothing to save). */
export function nameToCommit(currentName: string, draft: string): string | null {
  const trimmed = draft.trim();
  if (trimmed.length === 0 || trimmed === currentName) return null;
  return trimmed;
}
