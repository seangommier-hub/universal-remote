import { ActivityLogRecorder } from "../core/activityLog/ActivityLogRecorder";
import { ActivityLogEntry } from "../core/activityLog/activityLogEntry";
import { createActivityLogShipper, MAX_ENTRIES_PER_REQUEST } from "./activityLogShipper";

jest.mock("../discovery/familyCommandCenterActivityLog", () => ({ postActivityLogBatch: jest.fn() }));

function recorderWith(count: number): ActivityLogRecorder {
  const recorder = new ActivityLogRecorder({ getWho: () => "Sean", newId: () => "x", now: () => 0 });
  const saved: ActivityLogEntry[] = Array.from({ length: count }, (_, i) => ({
    id: `e${i}`,
    deviceId: "tv",
    deviceName: "Den TV",
    verb: "turned off",
    ok: true,
    at: "2026-09-26T01:00:00.000Z",
    who: "Sean",
  }));
  recorder.restore(saved);
  return recorder;
}

describe("createActivityLogShipper", () => {
  test("does nothing when the outbox is empty", async () => {
    const post = jest.fn();
    await createActivityLogShipper(recorderWith(0), post).flush();
    expect(post).not.toHaveBeenCalled();
  });

  test("removes entries once the Pi has accepted them", async () => {
    const recorder = recorderWith(3);
    await createActivityLogShipper(recorder, jest.fn().mockResolvedValue("sent")).flush();
    expect(recorder.pendingCount).toBe(0);
  });

  test("keeps entries when the Pi cannot be reached, without throwing", async () => {
    const recorder = recorderWith(3);
    await expect(createActivityLogShipper(recorder, jest.fn().mockRejectedValue(new Error("offline"))).flush()).resolves.toBeUndefined();
    expect(recorder.pendingCount).toBe(3);
  });

  test("keeps entries while Family Command Center is not set up", async () => {
    const recorder = recorderWith(2);
    await createActivityLogShipper(recorder, jest.fn().mockResolvedValue("unconfigured")).flush();
    expect(recorder.pendingCount).toBe(2);
  });

  test("drops a batch the Pi refuses for good so it cannot block the queue", async () => {
    const recorder = recorderWith(2);
    await createActivityLogShipper(recorder, jest.fn().mockResolvedValue("rejected")).flush();
    expect(recorder.pendingCount).toBe(0);
  });

  test("sends at most one request's worth, oldest first", async () => {
    const recorder = recorderWith(MAX_ENTRIES_PER_REQUEST + 20);
    const post = jest.fn().mockResolvedValue("sent");
    await createActivityLogShipper(recorder, post).flush();
    const sent = post.mock.calls[0][0] as ActivityLogEntry[];
    expect(sent).toHaveLength(MAX_ENTRIES_PER_REQUEST);
    expect(sent[0].id).toBe("e0");
    expect(recorder.pendingCount).toBe(20);
  });

  test("does not start a second request while one is in flight", async () => {
    const recorder = recorderWith(1);
    let release: (value: "sent") => void = () => undefined;
    const post = jest.fn().mockReturnValue(new Promise((resolve) => (release = resolve)));
    const shipper = createActivityLogShipper(recorder, post);
    const first = shipper.flush();
    await shipper.flush();
    release("sent");
    await first;
    expect(post).toHaveBeenCalledTimes(1);
  });
});
