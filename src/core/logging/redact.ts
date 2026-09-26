// Scrubs secrets from log lines before they leave the phone (ADR-HEARTH-146). Deliberately
// conservative: a false positive costs a little diagnostic detail, a false negative leaks a key.

export const REDACTED = "[redacted]";
const MAX_MESSAGE_LENGTH = 500;
const MAX_META_STRING_LENGTH = 300;
const MAX_META_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 30;

const SENSITIVE_WORDS = "token|psk|clientkey|client_key|secret|passw(?:or)?d|passcode|authorization|api[_-]?key|credential|bearer|cookie|pairing|private[_-]?key";
const SENSITIVE_KEY = new RegExp(SENSITIVE_WORDS, "i");
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const KEY_VALUE_IN_TEXT = new RegExp(`(["']?[\\w-]*(?:${SENSITIVE_WORDS})[\\w-]*["']?\\s*[:=]\\s*)("[^"]*"|'[^']*'|[^\\s,;&}\\]]+)`, "gi");

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/** Replaces secret-looking values inside free text (Bearer tokens, key=value, "key":"value"). */
export function redactText(text: string): string {
  return text.replace(BEARER_VALUE, `Bearer ${REDACTED}`).replace(KEY_VALUE_IN_TEXT, `$1${REDACTED}`);
}

function redactValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return truncate(redactText(value), MAX_META_STRING_LENGTH);
  if (value instanceof Error) return { name: value.name, message: truncate(redactText(value.message), MAX_META_STRING_LENGTH) };
  if (depth >= MAX_META_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactValue(item, depth + 1));
  if (typeof value === "object") return redactObject(value as Record<string, unknown>, depth);
  return String(value);
}

function redactObject(source: Record<string, unknown>, depth: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source).slice(0, MAX_OBJECT_KEYS)) {
    result[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactValue(source[key], depth + 1);
  }
  return result;
}

/** Returns a copy of a log line's meta with sensitive keys and secret-looking string values redacted. */
export function redactMeta(meta: Record<string, unknown>): Record<string, unknown> {
  return redactObject(meta, 0);
}

/** Redacts and length-limits a log message. */
export function redactMessage(message: string): string {
  return truncate(redactText(message), MAX_MESSAGE_LENGTH);
}
