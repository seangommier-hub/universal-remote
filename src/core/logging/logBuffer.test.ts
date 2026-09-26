import { getLogEntriesAfter, LOG_BUFFER_CAPACITY, recordLogEntry, resetLogBufferForTests } from "./logBuffer";
import { logger } from "./logger";

describe("logBuffer", () => {
  beforeEach(resetLogBufferForTests);

  test("keeps only warn and error entries", () => {
    recordLogEntry("debug", "S", "d");
    recordLogEntry("info", "S", "i");
    recordLogEntry("warn", "S", "w");
    recordLogEntry("error", "S", "e");
    expect(getLogEntriesAfter(0).map((entry) => entry.message)).toEqual(["w", "e"]);
  });

  test("drops the oldest entries beyond capacity and keeps ordering", () => {
    for (let i = 0; i < LOG_BUFFER_CAPACITY + 10; i++) recordLogEntry("warn", "S", `m${i}`);
    const entries = getLogEntriesAfter(0);
    expect(entries).toHaveLength(LOG_BUFFER_CAPACITY);
    expect(entries[0].message).toBe("m10");
    expect(entries[entries.length - 1].message).toBe(`m${LOG_BUFFER_CAPACITY + 9}`);
  });

  test("returns only entries newer than the given sequence number", () => {
    recordLogEntry("warn", "S", "a");
    const [first] = getLogEntriesAfter(0);
    recordLogEntry("error", "S", "b");
    expect(getLogEntriesAfter(first.seq).map((entry) => entry.message)).toEqual(["b"]);
  });

  test("the logger feeds warn and error into the buffer while still writing to the console", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "info").mockImplementation(() => undefined);
    logger.warn("Scope", "careful", { a: 1 });
    logger.info("Scope", "fyi");
    expect(warnSpy).toHaveBeenCalledWith("[WARN] [Scope] careful", { a: 1 });
    const entries = getLogEntriesAfter(0);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: "warn", scope: "Scope", message: "careful", meta: { a: 1 } });
    jest.restoreAllMocks();
  });
});
