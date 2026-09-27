import { msUntilProactiveRefresh } from "./haOAuthState";

describe("msUntilProactiveRefresh", () => {
  const issuedAt = 0;
  const expiresAt = 1800 * 1000; // a 30-minute Home Assistant access token

  test("at issuance, the refresh is due at 80% of the token's lifetime", () => {
    expect(msUntilProactiveRefresh({ issuedAt, expiresAt }, issuedAt)).toBe(1440 * 1000);
  });

  test("counts down as time passes", () => {
    expect(msUntilProactiveRefresh({ issuedAt, expiresAt }, 1000 * 1000)).toBe(440 * 1000);
  });

  test("is negative (overdue) once past the 80% mark, even before the token has actually expired", () => {
    expect(msUntilProactiveRefresh({ issuedAt, expiresAt }, 1500 * 1000)).toBe(-60 * 1000);
  });

  test("stays correct after a restart: only the fraction of the original lifetime matters, not time since 'now' was last read", () => {
    // A token issued an hour before the app was reopened, expiring in 30 more minutes from issuance:
    const restartIssuedAt = -3600 * 1000;
    const restartExpiresAt = restartIssuedAt + 1800 * 1000;
    expect(msUntilProactiveRefresh({ issuedAt: restartIssuedAt, expiresAt: restartExpiresAt }, 0)).toBe(-2160 * 1000);
  });
});
