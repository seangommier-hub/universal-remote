import { DEFAULT_FETCH_TIMEOUT_MS, FetchTimeoutError, fetchWithTimeout } from "./fetchWithTimeout";

const NEVER_RESOLVES = () => new Promise<Response>(() => {});

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("rejects with a FetchTimeoutError naming the host and the timeout when fetch never settles", async () => {
    global.fetch = jest.fn(NEVER_RESOLVES);

    const pending = fetchWithTimeout("http://192.168.1.172:3210/api/x", {}, 5000);
    const assertion = expect(pending).rejects.toThrow("Request to 192.168.1.172:3210 timed out after 5 seconds");
    jest.advanceTimersByTime(5000);

    await assertion;
    await expect(pending).rejects.toBeInstanceOf(FetchTimeoutError);
  });

  test("uses the default timeout when none is given", async () => {
    global.fetch = jest.fn(NEVER_RESOLVES);

    const pending = fetchWithTimeout("http://pi.local/api");
    const assertion = expect(pending).rejects.toBeInstanceOf(FetchTimeoutError);
    jest.advanceTimersByTime(DEFAULT_FETCH_TIMEOUT_MS);

    await assertion;
  });

  test("aborts the underlying request when the timeout fires", async () => {
    global.fetch = jest.fn(NEVER_RESOLVES);

    const pending = fetchWithTimeout("http://pi.local/api", {}, 1000);
    const assertion = expect(pending).rejects.toBeInstanceOf(FetchTimeoutError);
    jest.advanceTimersByTime(1000);
    await assertion;

    const passedSignal = (global.fetch as jest.Mock).mock.calls[0][1].signal as AbortSignal;
    expect(passedSignal.aborted).toBe(true);
  });

  test("resolves normally and leaves no pending timer when the response arrives in time", async () => {
    const response = { ok: true } as Response;
    global.fetch = jest.fn().mockResolvedValue(response);

    await expect(fetchWithTimeout("http://pi.local/api", {}, 1000)).resolves.toBe(response);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("a caller-supplied signal still cancels the request", async () => {
    global.fetch = jest.fn(NEVER_RESOLVES);
    const caller = new AbortController();

    fetchWithTimeout("http://pi.local/api", { signal: caller.signal }, 1000).catch(() => {});
    caller.abort();

    const passedSignal = (global.fetch as jest.Mock).mock.calls[0][1].signal as AbortSignal;
    expect(passedSignal.aborted).toBe(true);
  });
});
