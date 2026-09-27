import { HomeAssistantApiError } from "./HomeAssistantClient";
import { AssistUnsupportedError, converse } from "./haAssist";
import { HaInstance } from "./haInstance";

const INSTANCE: HaInstance = { id: "ha-http-ha.test-8123", baseUrl: "http://ha.test:8123", token: "super-secret-token" };

function installFetch(handler: (url: string, init: RequestInit) => Response) {
  global.fetch = jest.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init ?? {})) as unknown as typeof fetch;
}

describe("converse", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("POSTs text to /api/conversation/process with a bearer token and returns the plain speech", async () => {
    let seenAuth = "";
    let seenBody = "";
    installFetch((url, init) => {
      seenAuth = String((init.headers as Record<string, string>).Authorization);
      seenBody = String(init.body);
      expect(url).toBe("http://ha.test:8123/api/conversation/process");
      return { ok: true, status: 200, json: async () => ({ conversation_id: "conv-1", response: { response_type: "action_done", speech: { plain: { speech: "Turning off the lights" } } } }) } as Response;
    });
    const result = await converse(INSTANCE, "turn off the lights", null);
    expect(seenAuth).toBe("Bearer super-secret-token");
    expect(JSON.parse(seenBody)).toEqual({ text: "turn off the lights" });
    expect(result).toEqual({ speech: "Turning off the lights", conversationId: "conv-1", responseType: "action_done" });
  });

  it("includes conversation_id when continuing a conversation", async () => {
    let seenBody = "";
    installFetch((_url, init) => {
      seenBody = String(init.body);
      return { ok: true, status: 200, json: async () => ({ response: {} }) } as Response;
    });
    await converse(INSTANCE, "and the fan too", "conv-1");
    expect(JSON.parse(seenBody)).toEqual({ text: "and the fan too", conversation_id: "conv-1" });
  });

  it("falls back to a generic line when the server gives no plain speech", async () => {
    installFetch(() => ({ ok: true, status: 200, json: async () => ({ response: { response_type: "error" } }) }) as Response);
    const result = await converse(INSTANCE, "???", null);
    expect(result.speech).toMatch(/didn't say anything/);
  });

  it("throws AssistUnsupportedError on a 404 (no conversation API)", async () => {
    installFetch(() => ({ ok: false, status: 404, json: async () => ({}) }) as Response);
    await expect(converse(INSTANCE, "hello", null)).rejects.toBeInstanceOf(AssistUnsupportedError);
  });

  it("throws HomeAssistantApiError on any other failure status", async () => {
    installFetch(() => ({ ok: false, status: 500, json: async () => ({}) }) as Response);
    await expect(converse(INSTANCE, "hello", null)).rejects.toBeInstanceOf(HomeAssistantApiError);
  });
});
