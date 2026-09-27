import { randomUUID } from "expo-crypto";
import { ActivityHomeAssistant } from "../types/Activity";

// ADR-HEARTH-183: per-Activity Home Assistant webhook bridge config. Both directions are optional and
// independent. The incoming id is a bearer secret embedded in a URL path (never the shared
// HEARTH_API_TOKEN); the outgoing URL is whatever Home Assistant's own "webhook trigger" UI gave the
// household. Mirrors scheduleModel.ts's normalize/validate shape for the same reasons.

const MAX_WEBHOOK_URL_LENGTH = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A fresh, unguessable incoming webhook id -- a UUID v4 (122 bits), the same strength Hearth already uses for run ids. */
export function newHomeAssistantWebhookId(): string {
  return randomUUID();
}

/** True for a URL at least plausible to POST a JSON event to. Not a guarantee Home Assistant will accept it -- that is only known once a run actually posts. */
export function isPlausibleWebhookUrl(value: string): boolean {
  if (value.length === 0 || value.length > MAX_WEBHOOK_URL_LENGTH) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Turns a persisted or server record into a valid config. Unlike scheduleModel's `normalizeSchedules`,
 * an explicitly-present-but-empty object ({}) is preserved as `{}` rather than folded into `undefined` --
 * the editor always sends its current state explicitly (see ADR-HEARTH-183), so `{}` faithfully means
 * "configured, both directions off" while the key being absent entirely means "never touched by this
 * feature". Only `undefined` (the key was missing, or not an object) leaves an activity's own field alone.
 */
export function normalizeActivityHomeAssistant(raw: unknown): ActivityHomeAssistant | undefined {
  if (!isRecord(raw)) return undefined;
  const config: ActivityHomeAssistant = {};
  if (typeof raw.incomingWebhookId === "string" && raw.incomingWebhookId.trim().length > 0) {
    config.incomingWebhookId = raw.incomingWebhookId.trim();
  }
  if (typeof raw.outgoingWebhookUrl === "string" && isPlausibleWebhookUrl(raw.outgoingWebhookUrl.trim())) {
    config.outgoingWebhookUrl = raw.outgoingWebhookUrl.trim();
  }
  return config;
}

/** The first problem that would make the Pi reject this config, or null when it is fine (or absent). */
export function validateActivityHomeAssistant(config: ActivityHomeAssistant | undefined): string | null {
  if (!config?.outgoingWebhookUrl) return null;
  return isPlausibleWebhookUrl(config.outgoingWebhookUrl) ? null : "The Home Assistant webhook URL doesn't look like a valid http(s) address.";
}
