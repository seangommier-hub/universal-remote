import { FccUnreachableError } from "../core/network/fccErrors";
import { getPhoneName } from "../runtime/phoneName";
import { createPairInvite, PairCodeInvalidError, PairLockedOutError, redeemPairCode } from "./pairClient";

const SERVER = "https://hearth-relay.carddna.app/";

describe("redeemPairCode", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("posts the code, this phone's name, and no bearer token, and returns the pairing", async () => {
    const pairing = { baseUrl: "http://192.168.1.5:3210", publicBaseUrl: "https://hearth-relay.carddna.app", token: "tok" };
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(pairing) });

    await expect(redeemPairCode(SERVER, "K7M2QX9P")).resolves.toEqual(pairing);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://hearth-relay.carddna.app/api/integrations/hearth/pair/redeem");
    expect(init.body).toBe(JSON.stringify({ code: "K7M2QX9P", phoneName: getPhoneName() }));
    expect(init.headers.Authorization).toBeUndefined();
  });

  test("maps 400 to a wrong-code error", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 400 });
    await expect(redeemPairCode(SERVER, "K7M2QX9P")).rejects.toBeInstanceOf(PairCodeInvalidError);
  });

  test("maps 429 to a lockout error", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(redeemPairCode(SERVER, "K7M2QX9P")).rejects.toBeInstanceOf(PairLockedOutError);
  });

  test("reports an unreachable server as FccUnreachableError", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(redeemPairCode(SERVER, "K7M2QX9P")).rejects.toBeInstanceOf(FccUnreachableError);
  });

  test("reports a server that never answers as unreachable instead of hanging", async () => {
    jest.useFakeTimers();
    try {
      (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => undefined));
      const outcome = redeemPairCode(SERVER, "K7M2QX9P").catch((error) => error);
      await jest.advanceTimersByTimeAsync(9000);
      expect(await outcome).toBeInstanceOf(FccUnreachableError);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("createPairInvite", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("posts with the bearer token and returns the invite", async () => {
    const invite = { code: "K7M2QX9P", expiresAt: "2026-09-26T12:10:00.000Z", publicBaseUrl: null, baseUrl: "http://192.168.1.5:3210" };
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200, json: async () => invite });

    await expect(createPairInvite("http://192.168.1.5:3210/", "tok")).resolves.toEqual(invite);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://192.168.1.5:3210/api/integrations/hearth/pair/code");
    expect(init).toEqual(expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer tok" } }));
  });

  // ADR-HEARTH-189, phase 2: an owner requests a guest invite by passing guestHours.
  test("passing guestHours asks for a guest invite with a JSON body", async () => {
    const invite = { code: "K7M2QX9P", expiresAt: "2026-09-26T12:10:00.000Z", publicBaseUrl: null, baseUrl: "http://192.168.1.5:3210" };
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200, json: async () => invite });

    await createPairInvite("http://192.168.1.5:3210", "tok", 6);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers).toEqual({ Authorization: "Bearer tok", "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ role: "guest", guestHours: 6 });
  });
});
