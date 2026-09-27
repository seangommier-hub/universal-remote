import { Activity } from "../core/types/Activity";
import { ActivityRunResult } from "./activityRunner";
import { notifyHomeAssistant } from "./haOutgoingWebhook";

function activityWith(outgoingWebhookUrl?: string): Activity {
  return { id: "a1", name: "Movie Night", steps: [], version: 1, updatedAt: "now", homeAssistant: outgoingWebhookUrl ? { outgoingWebhookUrl } : {} };
}

function resultWith(steps: ActivityRunResult["steps"], cancelled = false): ActivityRunResult {
  return { runId: "r1", activityId: "a1", activityName: "Movie Night", startedAt: "t0", finishedAt: "t1", cancelled, steps };
}

describe("notifyHomeAssistant", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does nothing when the activity has no outgoing webhook configured", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await notifyHomeAssistant(activityWith(undefined), resultWith([{ index: 0, status: "ok" }]));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs a small JSON event with ok:true when every step succeeded", async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200 }) as Response);
    global.fetch = fetchMock as unknown as typeof fetch;
    await notifyHomeAssistant(activityWith("https://ha.example.com/api/webhook/xyz"), resultWith([{ index: 0, status: "ok" }]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ha.example.com/api/webhook/xyz");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ event: "hearth_activity_run", activity_id: "a1", activity_name: "Movie Night", run_id: "r1", ok: true });
  });

  it("reports ok:false when a step failed or the run was cancelled", async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200 }) as Response);
    global.fetch = fetchMock as unknown as typeof fetch;
    await notifyHomeAssistant(activityWith("https://ha.example.com/api/webhook/xyz"), resultWith([{ index: 0, status: "failed", error: "boom" }]));
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).ok).toBe(false);
  });

  it("never throws when the request fails", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    await expect(notifyHomeAssistant(activityWith("https://ha.example.com/api/webhook/xyz"), resultWith([{ index: 0, status: "ok" }]))).resolves.toBeUndefined();
  });

  it("never throws on a non-2xx response", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 }) as Response) as unknown as typeof fetch;
    await expect(notifyHomeAssistant(activityWith("https://ha.example.com/api/webhook/xyz"), resultWith([{ index: 0, status: "ok" }]))).resolves.toBeUndefined();
  });
});
