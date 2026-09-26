// ADR-HEARTH-155: after the PlayStation sign-in the browser lands on a blank/error page whose
// address holds the sign-in code. People paste the whole address, sometimes with surrounding text
// or trailing whitespace; this finds the redirect URL in whatever was pasted.

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/i;
const CODE_PARAMETER_PATTERN = /[?&#]code=[^&#\s]+/i;

export type Ps5RedirectResult = { kind: "ok"; redirectUrl: string } | { kind: "empty" } | { kind: "no-code" };

/** Finds the PSN redirect URL (one containing `code=`) inside pasted text. */
export function extractPs5RedirectUrl(pastedText: string): Ps5RedirectResult {
  const text = pastedText.trim();
  if (text.length === 0) return { kind: "empty" };
  const match = URL_PATTERN.exec(text);
  if (match && CODE_PARAMETER_PATTERN.test(match[0])) return { kind: "ok", redirectUrl: match[0] };
  return { kind: "no-code" };
}

/** Plain explanation for a pasted value that has no sign-in code, or null when nothing needs saying. */
export function describeRedirectProblem(result: Ps5RedirectResult): string | null {
  if (result.kind !== "no-code") return null;
  return "That doesn't look like the sign-in address. It should contain \"code=\". Copy the whole address from the blank page after you sign in.";
}
