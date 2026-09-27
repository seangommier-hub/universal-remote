import * as WebBrowser from "expo-web-browser";
import { signInWithHomeAssistant } from "./haOAuthSignIn";
import { HaOAuthTokens, exchangeHaAuthorizationCode } from "./haOAuthProtocol";

jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock("./haOAuthProtocol", () => {
  const actual = jest.requireActual("./haOAuthProtocol");
  return { ...actual, exchangeHaAuthorizationCode: jest.fn() };
});

const openAuthSessionAsync = WebBrowser.openAuthSessionAsync as jest.Mock;
const exchangeMock = exchangeHaAuthorizationCode as jest.Mock;
const FIXED_STATE = "fixed-state";
const generateState = () => FIXED_STATE;

const tokens: HaOAuthTokens = { accessToken: "at", refreshToken: "rt", issuedAt: 1000, expiresAt: 2_800_000 };

describe("signInWithHomeAssistant", () => {
  beforeEach(() => {
    openAuthSessionAsync.mockReset();
    exchangeMock.mockReset();
  });

  test("exchanges the code and returns tokens on a successful redirect with a matching state", async () => {
    openAuthSessionAsync.mockResolvedValue({ type: "success", url: `hearth://ha-auth?code=abc&state=${FIXED_STATE}` });
    exchangeMock.mockResolvedValue(tokens);

    const result = await signInWithHomeAssistant("http://ha.local:8123", generateState);

    expect(result).toEqual({ status: "success", tokens });
    expect(exchangeMock).toHaveBeenCalledWith("http://ha.local:8123", "abc");
    expect(openAuthSessionAsync).toHaveBeenCalledWith(expect.stringContaining("/auth/authorize?"), "hearth://ha-auth");
  });

  test("reports cancelled when the browser is dismissed or cancelled", async () => {
    openAuthSessionAsync.mockResolvedValue({ type: "cancel" });
    expect(await signInWithHomeAssistant("http://ha.local:8123", generateState)).toEqual({ status: "cancelled" });

    openAuthSessionAsync.mockResolvedValue({ type: "dismiss" });
    expect(await signInWithHomeAssistant("http://ha.local:8123", generateState)).toEqual({ status: "cancelled" });
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  test("reports an error redirect from Home Assistant (e.g. the user declined)", async () => {
    openAuthSessionAsync.mockResolvedValue({ type: "success", url: "hearth://ha-auth?error=access_denied" });
    const result = await signInWithHomeAssistant("http://ha.local:8123", generateState);
    expect(result).toEqual({ status: "error", message: expect.stringContaining("access_denied") });
  });

  test("rejects a redirect whose state does not match what Hearth sent (CSRF protection), without exchanging the code", async () => {
    openAuthSessionAsync.mockResolvedValue({ type: "success", url: "hearth://ha-auth?code=abc&state=someone-elses-state" });
    const result = await signInWithHomeAssistant("http://ha.local:8123", generateState);
    expect(result.status).toBe("error");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  test("reports an error when the code exchange itself fails", async () => {
    openAuthSessionAsync.mockResolvedValue({ type: "success", url: `hearth://ha-auth?code=abc&state=${FIXED_STATE}` });
    exchangeMock.mockRejectedValue(new Error("Home Assistant rejected the sign-in request (400)"));
    const result = await signInWithHomeAssistant("http://ha.local:8123", generateState);
    expect(result).toEqual({ status: "error", message: "Home Assistant rejected the sign-in request (400)" });
  });
});
