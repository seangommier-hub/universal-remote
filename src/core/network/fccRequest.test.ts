import { fccFetch } from "./fccRequest";
import { FccUnreachableError } from "./fccErrors";
import {
  AWAY_MEMORY_MS,
  getConnectivityMode,
  isPrivateLanHost,
  isPublicRouteCurrentlyFailing,
  resetConnectivityForTests,
  shouldSkipDirectAttempt,
} from "./fccConnectivity";
import { DEFAULT_FETCH_TIMEOUT_MS } from "./fetchWithTimeout";
import type { FamilyCommandCenterConfig } from "../../discovery/familyCommandCenterConfig";

const LAN_URL = "http://192.168.1.172:3210";
const PUBLIC_URL = "https://hearth-relay.example.app";
const PATH = "/api/integrations/hearth/wake-on-lan";
const CONFIG: FamilyCommandCenterConfig = { baseUrl: LAN_URL, token: "t", publicBaseUrl: PUBLIC_URL };

function ok(status = 200): Response {
  return { ok: status < 400, status, json: async () => ({}) } as Response;
}

function urlsCalled(): string[] {
  return (global.fetch as jest.Mock).mock.calls.map((call) => call[0] as string);
}

describe("fccFetch", () => {
  beforeEach(() => {
    resetConnectivityForTests();
    global.fetch = jest.fn();
    jest.useFakeTimers().setSystemTime(new Date("2026-09-26T12:00:00Z"));
  });

  afterEach(() => jest.useRealTimers());

  test("uses the LAN address and reports home when it answers", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(ok());
    await fccFetch(CONFIG, PATH);
    expect(urlsCalled()).toEqual([`${LAN_URL}${PATH}`]);
    expect(getConnectivityMode()).toBe("home");
  });

  test("falls back to the public address when the LAN cannot be reached, and reports away", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("Network request failed")).mockResolvedValueOnce(ok());
    await fccFetch(CONFIG, PATH);
    expect(urlsCalled()).toEqual([`${LAN_URL}${PATH}`, `${PUBLIC_URL}${PATH}`]);
    expect(getConnectivityMode()).toBe("away");
  });

  test("a 401 from the LAN is returned as-is and never falls through to the public address", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(ok(401));
    const response = await fccFetch(CONFIG, PATH);
    expect(response.status).toBe(401);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("throws FccUnreachableError when neither address can be reached", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError("Network request failed"));
    await expect(fccFetch(CONFIG, PATH)).rejects.toBeInstanceOf(FccUnreachableError);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  // 2026-10-05: a failed public-address attempt used to go unrecorded, so deriveRemoteViewState.ts
  // had nothing real to tell "away" (relay answered recently) apart from "away, but the relay just
  // failed" -- confirmed live during a real Pi outage, see fccConnectivity.ts's own comment.
  test("a failed public address is recorded, not just a failed LAN one", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError("Network request failed"));
    await expect(fccFetch(CONFIG, PATH)).rejects.toBeInstanceOf(FccUnreachableError);
    expect(isPublicRouteCurrentlyFailing()).toBe(true);
  });

  test("a public address that answers clears an earlier public failure", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError("Network request failed"));
    await expect(fccFetch(CONFIG, PATH)).rejects.toBeInstanceOf(FccUnreachableError);
    expect(isPublicRouteCurrentlyFailing()).toBe(true);

    (global.fetch as jest.Mock).mockReset().mockRejectedValueOnce(new TypeError("Network request failed")).mockResolvedValueOnce(ok());
    await fccFetch(CONFIG, PATH);
    expect(isPublicRouteCurrentlyFailing()).toBe(false);
  });

  test("without a public address only the LAN is tried", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError("Network request failed"));
    await expect(fccFetch({ baseUrl: LAN_URL, token: "t" }, PATH)).rejects.toBeInstanceOf(FccUnreachableError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  // ADR-HEARTH-191: the Ring camera routes only exist on the LAN — the Pi 404s them through the
  // public tunnel by design, so `lanOnly` must skip that leg entirely, even with a public address
  // configured and even in away mode (where the public leg would otherwise be tried first).
  describe("lanOnly", () => {
    test("never tries the public address, even when one is configured", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new TypeError("Network request failed"));
      await expect(fccFetch(CONFIG, PATH, {}, DEFAULT_FETCH_TIMEOUT_MS, { lanOnly: true })).rejects.toBeInstanceOf(FccUnreachableError);
      expect(urlsCalled()).toEqual([`${LAN_URL}${PATH}`]);
    });

    test("still skips the public address after away-mode memory would otherwise prefer it", async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("down")).mockResolvedValueOnce(ok());
      await fccFetch(CONFIG, PATH); // learns "away"
      (global.fetch as jest.Mock).mockClear();
      (global.fetch as jest.Mock).mockResolvedValue(ok());
      await fccFetch(CONFIG, PATH, {}, DEFAULT_FETCH_TIMEOUT_MS, { lanOnly: true });
      expect(urlsCalled()).toEqual([`${LAN_URL}${PATH}`]);
    });
  });

  describe("away-mode memory", () => {
    beforeEach(async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("down")).mockResolvedValueOnce(ok());
      await fccFetch(CONFIG, PATH);
      (global.fetch as jest.Mock).mockClear();
    });

    test("goes straight to the public address for the next requests, skipping the doomed LAN attempt", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(ok());
      await fccFetch(CONFIG, PATH);
      expect(urlsCalled()).toEqual([`${PUBLIC_URL}${PATH}`]);
    });

    test("probes the LAN again after the memory expires and switches back to home", async () => {
      jest.setSystemTime(Date.now() + AWAY_MEMORY_MS + 1);
      (global.fetch as jest.Mock).mockResolvedValue(ok());
      await fccFetch(CONFIG, PATH);
      expect(urlsCalled()).toEqual([`${LAN_URL}${PATH}`]);
      expect(getConnectivityMode()).toBe("home");
    });

    test("still tries the LAN when the public address is also unreachable", async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("down")).mockResolvedValueOnce(ok());
      await fccFetch(CONFIG, PATH);
      expect(urlsCalled()).toEqual([`${PUBLIC_URL}${PATH}`, `${LAN_URL}${PATH}`]);
      expect(getConnectivityMode()).toBe("home");
    });
  });

  // ADR-HEARTH-179: a dead/stale LAN hop used to pay the caller's full timeout (8s for every
  // relay-routed command) before falling back to a working public tunnel. These prove the LAN hop
  // now gives up at its own short budget instead, while the public hop (and a LAN-only config with
  // no fallback to catch it) still get the full requested budget.
  describe("per-hop timeout budgets", () => {
    test("a LAN hop that never answers gives up at ~2.5s (not the full 8s request budget), then falls back to a working public hop", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => (url.startsWith(LAN_URL) ? new Promise(() => {}) : Promise.resolve(ok())));

      const promise = fccFetch(CONFIG, PATH, {}, DEFAULT_FETCH_TIMEOUT_MS);
      let resolved = false;
      void promise.then(() => {
        resolved = true;
      });

      await jest.advanceTimersByTimeAsync(2499);
      expect(resolved).toBe(false); // the LAN hop hasn't given up yet, just shy of its short budget

      await jest.advanceTimersByTimeAsync(2); // crosses the ~2.5s LAN budget
      const response = await promise;
      expect(resolved).toBe(true);
      expect(response.status).toBe(200);
      expect(urlsCalled()).toEqual([`${LAN_URL}${PATH}`, `${PUBLIC_URL}${PATH}`]);
    });

    test("the public hop keeps the caller's full timeout budget, not the shortened LAN one", async () => {
      (global.fetch as jest.Mock).mockImplementation(
        (url: string) => (url.startsWith(LAN_URL) ? Promise.reject(new TypeError("Network request failed")) : new Promise((resolve) => setTimeout(() => resolve(ok()), 5000)))
      );

      const promise = fccFetch(CONFIG, PATH, {}, DEFAULT_FETCH_TIMEOUT_MS);
      const response = await jest.advanceTimersByTimeAsync(5000).then(() => promise);

      expect(response.status).toBe(200); // a 5s public response is well past the 2.5s LAN budget but still inside the full 8s request budget
    });

    test("a LAN-only config (no public tunnel configured) keeps the full request budget — nothing else would catch a shortened failure", async () => {
      (global.fetch as jest.Mock).mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(ok()), 5000)));

      const promise = fccFetch({ baseUrl: LAN_URL, token: "t" }, PATH, {}, DEFAULT_FETCH_TIMEOUT_MS);
      const response = await jest.advanceTimersByTimeAsync(5000).then(() => promise);

      expect(response.status).toBe(200); // would have been a false failure at 2.5s if the LAN-only hop were ever shortened
    });
  });
});

describe("direct-attempt skipping", () => {
  beforeEach(() => resetConnectivityForTests());

  test("recognises private LAN hosts only", () => {
    expect(["192.168.1.5", "10.0.0.9", "172.16.0.1", "172.31.9.9"].every(isPrivateLanHost)).toBe(true);
    expect(["8.8.8.8", "172.32.0.1", "example.com"].some(isPrivateLanHost)).toBe(false);
  });

  test("is never skipped while the mode is unknown", () => {
    expect(shouldSkipDirectAttempt("192.168.1.5")).toBe(false);
  });
});
