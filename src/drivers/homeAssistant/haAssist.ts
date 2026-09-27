import { fetchWithTimeout } from "../../core/network/fetchWithTimeout";
import { HomeAssistantApiError, normalizeHomeAssistantUrl } from "./HomeAssistantClient";
import { HaInstance } from "./haInstance";

// ADR-HEARTH-183: Home Assistant's Assist (conversation) REST endpoint. Shape confirmed against
// developers.home-assistant.io/docs/intent_conversation_api (fetched 2026-09-27), not memory:
// POST /api/conversation/process { text, language?, agent_id?, conversation_id? } ->
// { conversation_id, continue_conversation, response: { response_type, language, data, speech } }.

const CONVERSATION_PATH = "/api/conversation/process";
const ASSIST_TIMEOUT_MS = 20_000;
const HTTP_NOT_FOUND = 404;
const FALLBACK_SPEECH = "Home Assistant didn't say anything back.";

export interface AssistResponse {
  speech: string;
  conversationId: string | null;
  responseType: string;
}

interface ConversationProcessBody {
  conversation_id?: string;
  response?: {
    response_type?: string;
    speech?: { plain?: { speech?: string } };
  };
}

/** Thrown when the server has no /api/conversation/process route at all (an older Home Assistant, or Assist disabled). */
export class AssistUnsupportedError extends Error {}

/** Sends one line of text to Home Assistant's Assist conversation agent and returns its plain-language reply. */
export async function converse(instance: HaInstance, text: string, conversationId: string | null): Promise<AssistResponse> {
  const baseUrl = normalizeHomeAssistantUrl(instance.baseUrl);
  const response = await fetchWithTimeout(
    `${baseUrl}${CONVERSATION_PATH}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${instance.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...(conversationId ? { conversation_id: conversationId } : {}) }),
    },
    ASSIST_TIMEOUT_MS
  );
  if (response.status === HTTP_NOT_FOUND) throw new AssistUnsupportedError("This Home Assistant instance doesn't support Assist (conversation) yet.");
  if (!response.ok) throw new HomeAssistantApiError(`Home Assistant returned ${response.status}`, response.status);
  const body = (await response.json()) as ConversationProcessBody;
  return {
    speech: body.response?.speech?.plain?.speech ?? FALLBACK_SPEECH,
    conversationId: body.conversation_id ?? null,
    responseType: body.response?.response_type ?? "unknown",
  };
}
