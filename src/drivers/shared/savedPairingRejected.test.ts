import { NEEDS_RE_PAIR_STATE_KEY } from "../../core/state/needsRePair";
import { flagRejectedPairing, SavedPairingRejectedError } from "./savedPairingRejected";

describe("flagRejectedPairing", () => {
  test("a refused saved pairing marks the values", () => {
    const flagged = flagRejectedPairing({ power: "on" }, new SavedPairingRejectedError("refused"));
    expect(flagged).toEqual({ power: "on", [NEEDS_RE_PAIR_STATE_KEY]: true });
  });

  test("an ordinary failure leaves the values untouched", () => {
    const values = { power: "on" };
    expect(flagRejectedPairing(values, new Error("Timed out"))).toBe(values);
  });

  test("an ordinary failure does not clear a flag set by an earlier refusal", () => {
    const values = { [NEEDS_RE_PAIR_STATE_KEY]: true };
    expect(flagRejectedPairing(values, new Error("Could not open a WebSocket"))).toBe(values);
  });
});
