import { HA_OAUTH_CLIENT_ID_URL, HA_OAUTH_REDIRECT_URI } from "./haOAuthConfig";
import { HaOAuthError, buildHaAuthorizeUrl, exchangeHaAuthorizationCode, isInvalidGrant, parseHaAuthRedirect, refreshHaAccessToken } from "./haOAuthProtocol";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe("buildHaAuthorizeUrl", () => {
  test("includes response_type, client_id, redirect_uri and state, URL-encoded", () => {
    const url = buildHaAuthorizeUrl("http://ha.local:8123", "abc state");
    expect(url).toBe(
      `http://ha.local:8123/auth/authorize?response_type=code&client_id=${encodeURIComponent(HA_OAUTH_CLIENT_ID_URL)}&redirect_uri=${encodeURIComponent(HA_OAUTH_REDIRECT_URI)}&state=abc+state`
    );
  });

  test("normalizes a bare host the same way the REST client does", () => {
    expect(buildHaAuthorizeUrl("homeassistant.local", "s")).toContain("http://homeassistant.local:8123/auth/authorize?");
  });
});

describe("parseHaAuthRedirect", () => {
  test("reads code and state from a matching redirect", () => {
    expect(parseHaAuthRedirect("hearth://ha-auth?code=abc123&state=xyz")).toEqual({ code: "abc123", state: "xyz" });
  });

  test("reads an error redirect", () => {
    expect(parseHaAuthRedirect("hearth://ha-auth?error=access_denied")).toEqual({ error: "access_denied" });
  });

  test("returns null for a URL that isn't this redirect at all", () => {
    expect(parseHaAuthRedirect("hearth://pair?code=1")).toBeNull();
    expect(parseHaAuthRedirect(null)).toBeNull();
    expect(parseHaAuthRedirect(undefined)).toBeNull();
  });

  test("returns null when code or state is missing", () => {
    expect(parseHaAuthRedirect("hearth://ha-auth?code=abc123")).toBeNull();
    expect(parseHaAuthRedirect("hearth://ha-auth?state=xyz")).toBeNull();
    expect(parseHaAuthRedirect("hearth://ha-auth")).toBeNull();
  });

  test("is case-insensitive on the scheme", () => {
    expect(parseHaAuthRedirect("Hearth://HA-AUTH?code=a&state=b")).toEqual({ code: "a", state: "b" });
  });
});

describe("exchangeHaAuthorizationCode", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  test("shapes a successful response into tokens with issuedAt/expiresAt", async () => {
    const issuedNear = Date.now();
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 1800 }));
    const tokens = await exchangeHaAuthorizationCode("http://ha.local:8123", "the-code");
    expect(tokens.accessToken).toBe("at");
    expect(tokens.refreshToken).toBe("rt");
    expect(tokens.issuedAt).toBeGreaterThanOrEqual(issuedNear);
    expect(tokens.expiresAt - tokens.issuedAt).toBe(1800 * 1000);
  });

  test("posts grant_type=authorization_code with the code and client_id, form-encoded", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 1800 }));
    await exchangeHaAuthorizationCode("http://ha.local:8123", "the-code");
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://ha.local:8123/auth/token");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(init.body);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("client_id")).toBe(HA_OAUTH_CLIENT_ID_URL);
  });

  test("throws HaOAuthError with the error code on a rejected request", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ error: "invalid_grant", error_description: "Invalid code" }, false, 400));
    await expect(exchangeHaAuthorizationCode("http://ha.local:8123", "bad-code")).rejects.toMatchObject({ code: "invalid_grant", message: "Invalid code" });
  });

  test("throws a codeless HaOAuthError on a network failure", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down"));
    expect.assertions(2);
    try {
      await exchangeHaAuthorizationCode("http://ha.local:8123", "c");
    } catch (error) {
      expect(error).toBeInstanceOf(HaOAuthError);
      expect((error as HaOAuthError).code).toBeUndefined();
    }
  });
});

describe("refreshHaAccessToken", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  test("posts grant_type=refresh_token with the refresh token and client_id", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ access_token: "at2", expires_in: 1800 }));
    await refreshHaAccessToken("http://ha.local:8123", "old-refresh");
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = new URLSearchParams(init.body);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("old-refresh");
  });

  test("keeps the prior refresh token when the response does not include a new one", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ access_token: "at2", expires_in: 1800 }));
    const tokens = await refreshHaAccessToken("http://ha.local:8123", "old-refresh");
    expect(tokens.refreshToken).toBe("old-refresh");
  });

  test("uses a rotated refresh token when the response includes one", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ access_token: "at2", refresh_token: "new-refresh", expires_in: 1800 }));
    const tokens = await refreshHaAccessToken("http://ha.local:8123", "old-refresh");
    expect(tokens.refreshToken).toBe("new-refresh");
  });

  test("a rejected refresh (invalid_grant) is detected by isInvalidGrant", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ error: "invalid_grant" }, false, 400));
    expect.assertions(1);
    try {
      await refreshHaAccessToken("http://ha.local:8123", "revoked");
    } catch (error) {
      expect(isInvalidGrant(error)).toBe(true);
    }
  });

  test("isInvalidGrant is false for any other error", () => {
    expect(isInvalidGrant(new HaOAuthError("timeout", undefined))).toBe(false);
    expect(isInvalidGrant(new Error("plain"))).toBe(false);
    expect(isInvalidGrant(new HaOAuthError("bad request", "invalid_request"))).toBe(false);
  });
});
