import { FccUnreachableError } from "../core/network/fccErrors";
import { PairCodeInvalidError, PairLockedOutError } from "../discovery/pairClient";
import { describePairFailure, LOCKED_OUT_MESSAGE, WRONG_CODE_MESSAGE } from "./describePairFailure";

describe("describePairFailure", () => {
  test("wrong, expired or used codes get one plain message", () => {
    expect(describePairFailure(new PairCodeInvalidError("x"))).toEqual({ message: WRONG_CODE_MESSAGE, diagnosis: null });
  });

  test("a lockout says to wait 10 minutes", () => {
    expect(describePairFailure(new PairLockedOutError("x")).message).toBe(LOCKED_OUT_MESSAGE);
    expect(LOCKED_OUT_MESSAGE).toMatch(/wait 10 minutes/);
  });

  test("an unreachable server shows the network-failure notice", () => {
    const notice = describePairFailure(new FccUnreachableError("Network request failed"));
    expect(notice.message).toBeNull();
    expect(notice.diagnosis?.kind).toBe("lan-blocked");
  });
});
