import { fccFetch } from "./fccRequest";
import { FccUnreachableError } from "./fccErrors";
import { AWAY_MEMORY_MS, getConnectivityMode, isPrivateLanHost, resetConnectivityForTests, shouldSkipDirectAttempt } from "./fccConnectivity";
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

  test("without a public address only the LAN is tried", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError("Network request failed"));
    await expect(fccFetch({ baseUrl: LAN_URL, token: "t" }, PATH)).rejects.toBeInstanceOf(FccUnreachableError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
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
