import { resetHaInstancesForTests } from "./haInstanceRegistry";
import { HA_OAUTH_RETRY_BASE_DELAY_MS, resetHaOAuthSchedulerForTests, scheduleHaOAuthRefresh, stopHaOAuthRefresh } from "./haOAuthRefreshScheduler";
import { HaOAuthError, refreshHaAccessToken } from "./haOAuthProtocol";
import { HaOAuthState } from "./haOAuthState";
import { getHaOAuthState, resetHaOAuthStatesForTests, setHaOAuthState } from "./haOAuthStateRegistry";

// A jittered backoff would make retry-delay assertions flaky; every other driver's reconnect test mocks this
// the same way (see haSession.test.ts).
jest.mock("../shared/backoffJitter", () => ({ withBackoffJitter: (delayMs: number) => delayMs }));
jest.mock("./haOAuthProtocol", () => {
  const actual = jest.requireActual("./haOAuthProtocol");
  return { ...actual, refreshHaAccessToken: jest.fn() };
});

const refreshMock = refreshHaAccessToken as jest.Mock;
const BASE_URL = "http://ha.local:8123";

function baseState(overrides: Partial<HaOAuthState> = {}): HaOAuthState {
  return { instanceId: "ha-instance-1", refreshToken: "rt-1", issuedAt: 0, expiresAt: 1800 * 1000, needsSignIn: false, ...overrides };
}

describe("scheduleHaOAuthRefresh", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0); // baseState()'s issuedAt/expiresAt are epoch-relative; pin "now" so scheduling math lines up
    resetHaOAuthSchedulerForTests();
    resetHaOAuthStatesForTests();
    resetHaInstancesForTests();
    refreshMock.mockReset();
  });

  afterEach(() => {
    resetHaOAuthSchedulerForTests();
    jest.useRealTimers();
  });

  test("fires the refresh at 80% of the token's lifetime, not before", () => {
    scheduleHaOAuthRefresh(BASE_URL, baseState());
    jest.advanceTimersByTime(1440 * 1000 - 1);
    expect(refreshMock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(refreshMock).toHaveBeenCalledWith(BASE_URL, "rt-1");
  });

  test("on success, persists the new token and reschedules using the new expiry", async () => {
    refreshMock.mockResolvedValue({ accessToken: "at-2", refreshToken: "rt-2", issuedAt: 1440 * 1000, expiresAt: 1440 * 1000 + 1800 * 1000 });
    scheduleHaOAuthRefresh(BASE_URL, baseState());
    await jest.advanceTimersByTimeAsync(1440 * 1000);

    const stored = getHaOAuthState("ha-instance-1");
    expect(stored).toMatchObject({ refreshToken: "rt-2", needsSignIn: false });

    refreshMock.mockClear();
    await jest.advanceTimersByTimeAsync(1440 * 1000 - 1);
    expect(refreshMock).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(refreshMock).toHaveBeenCalledWith(BASE_URL, "rt-2");
  });

  test("on invalid_grant, marks the instance needs-sign-in and does not reschedule", async () => {
    refreshMock.mockRejectedValue(new HaOAuthError("revoked", "invalid_grant"));
    scheduleHaOAuthRefresh(BASE_URL, baseState());
    await jest.advanceTimersByTimeAsync(1440 * 1000);

    expect(getHaOAuthState("ha-instance-1")?.needsSignIn).toBe(true);
    refreshMock.mockClear();
    await jest.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  test("on any other failure, retries with jittered backoff instead of giving up", async () => {
    refreshMock.mockRejectedValue(new Error("network blip"));
    scheduleHaOAuthRefresh(BASE_URL, baseState());
    await jest.advanceTimersByTimeAsync(1440 * 1000);
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(getHaOAuthState("ha-instance-1")?.needsSignIn).toBeUndefined();

    refreshMock.mockClear();
    await jest.advanceTimersByTimeAsync(HA_OAUTH_RETRY_BASE_DELAY_MS);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  test("does not schedule at all for an instance already marked needs-sign-in", () => {
    scheduleHaOAuthRefresh(BASE_URL, baseState({ needsSignIn: true }));
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  test("stopHaOAuthRefresh cancels a pending timer", () => {
    scheduleHaOAuthRefresh(BASE_URL, baseState());
    stopHaOAuthRefresh("ha-instance-1");
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  test("setHaOAuthState from elsewhere does not itself trigger a refresh (scheduling is explicit)", () => {
    setHaOAuthState(baseState());
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
