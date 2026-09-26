import { recordLogEntry, resetLogBufferForTests } from "../core/logging/logBuffer";
import { createClientLogShipper, MAX_ENTRIES_PER_REQUEST, SHIP_INTERVAL_MS } from "./clientLogShipper";
import { ClientLogWireEntry } from "../discovery/familyCommandCenterClientLog";

jest.mock("../discovery/familyCommandCenterClientLog", () => ({ postClientLogBatch: jest.fn() }));

describe("createClientLogShipper", () => {
  let clock = 0;
  const now = () => clock;

  beforeEach(() => {
    resetLogBufferForTests();
    clock = 1_000_000;
  });

  test("does nothing when the buffer has no new entries", async () => {
    const post = jest.fn().mockResolvedValue("sent");
    await createClientLogShipper(post, now).flush();
    expect(post).not.toHaveBeenCalled();
  });

  test("sends redacted entries once and never re-sends them", async () => {
    const post = jest.fn().mockResolvedValue("sent");
    const shipper = createClientLogShipper(post, now);
    recordLogEntry("error", "Lg", "bad Authorization: Bearer abc", { clientKey: "k", host: "tv" }, 5);
    await shipper.flush();
    expect(post).toHaveBeenCalledTimes(1);
    const sent = post.mock.calls[0][0] as ClientLogWireEntry[];
    expect(sent[0]).toEqual({ t: 5, level: "error", scope: "Lg", message: "bad Authorization: [redacted] [redacted]", meta: { clientKey: "[redacted]", host: "tv" } });
    clock += SHIP_INTERVAL_MS;
    await shipper.flush();
    expect(post).toHaveBeenCalledTimes(1);
  });

  test("throttles to once per interval and sends the newer entries afterwards", async () => {
    const post = jest.fn().mockResolvedValue("sent");
    const shipper = createClientLogShipper(post, now);
    recordLogEntry("warn", "S", "one");
    await shipper.flush();
    recordLogEntry("warn", "S", "two");
    clock += SHIP_INTERVAL_MS - 1;
    await shipper.flush();
    expect(post).toHaveBeenCalledTimes(1);
    clock += 1;
    await shipper.flush();
    expect(post).toHaveBeenCalledTimes(2);
    expect((post.mock.calls[1][0] as ClientLogWireEntry[]).map((e) => e.message)).toEqual(["two"]);
  });

  test("caps a request at the newest 200 entries", async () => {
    const post = jest.fn().mockResolvedValue("sent");
    for (let i = 0; i < MAX_ENTRIES_PER_REQUEST + 50; i++) recordLogEntry("warn", "S", `m${i}`);
    await createClientLogShipper(post, now).flush();
    const sent = post.mock.calls[0][0] as ClientLogWireEntry[];
    expect(sent).toHaveLength(MAX_ENTRIES_PER_REQUEST);
    expect(sent[0].message).toBe("m50");
  });

  test("swallows failures, keeps the entries, and retries only after the interval", async () => {
    const post = jest.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("sent");
    const shipper = createClientLogShipper(post, now);
    recordLogEntry("warn", "S", "kept");
    await expect(shipper.flush()).resolves.toBeUndefined();
    await shipper.flush();
    expect(post).toHaveBeenCalledTimes(1);
    clock += SHIP_INTERVAL_MS;
    await shipper.flush();
    expect(post).toHaveBeenCalledTimes(2);
    expect((post.mock.calls[1][0] as ClientLogWireEntry[])[0].message).toBe("kept");
  });

  test("keeps entries when Family Command Center is unconfigured", async () => {
    const post = jest.fn().mockResolvedValueOnce("unconfigured").mockResolvedValue("sent");
    const shipper = createClientLogShipper(post, now);
    recordLogEntry("warn", "S", "later");
    await shipper.flush();
    clock += SHIP_INTERVAL_MS;
    await shipper.flush();
    expect((post.mock.calls[1][0] as ClientLogWireEntry[])[0].message).toBe("later");
  });
});
