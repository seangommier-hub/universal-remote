import { dedupeInFlight } from "./inFlightDedupe";

describe("dedupeInFlight", () => {
  test("concurrent calls for one key share a single attempt", async () => {
    const inFlight = new Map<string, Promise<number>>();
    const start = jest.fn(async () => 7);
    const results = await Promise.all([dedupeInFlight(inFlight, "a", start), dedupeInFlight(inFlight, "a", start)]);
    expect(results).toEqual([7, 7]);
    expect(start).toHaveBeenCalledTimes(1);
  });

  test("a later call after the attempt settled starts a fresh one, even after a rejection", async () => {
    const inFlight = new Map<string, Promise<number>>();
    const start = jest.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(1);
    await expect(dedupeInFlight(inFlight, "a", start)).rejects.toThrow("down");
    await expect(dedupeInFlight(inFlight, "a", start)).resolves.toBe(1);
    expect(start).toHaveBeenCalledTimes(2);
  });

  test("different keys do not share attempts", async () => {
    const inFlight = new Map<string, Promise<string>>();
    const start = jest.fn(async () => "x");
    await Promise.all([dedupeInFlight(inFlight, "a", start), dedupeInFlight(inFlight, "b", start)]);
    expect(start).toHaveBeenCalledTimes(2);
  });
});
