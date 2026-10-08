import { markNeedsRePair, NEEDS_RE_PAIR_STATE_KEY, stateNeedsRePair } from "./needsRePair";
import { DeviceState } from "../types/DeviceState";

function state(connection: DeviceState["connection"], values: Record<string, unknown>): DeviceState {
  return { connection, values, lastUpdated: 0 };
}

describe("needsRePair", () => {
  test("markNeedsRePair keeps the other values and does not change the original", () => {
    const original = { power: "on" };
    const marked = markNeedsRePair(original);
    expect(marked).toEqual({ power: "on", [NEEDS_RE_PAIR_STATE_KEY]: true });
    expect(original).toEqual({ power: "on" });
  });

  test("a disconnected device carrying the flag needs a re-pair", () => {
    expect(stateNeedsRePair(state("disconnected", markNeedsRePair({})))).toBe(true);
    expect(stateNeedsRePair(state("unknown", markNeedsRePair({})))).toBe(true);
  });

  test("a connected device never needs a re-pair, even if a stale flag is still in its values", () => {
    expect(stateNeedsRePair(state("connected", markNeedsRePair({})))).toBe(false);
  });

  test("a disconnected device without the flag does not need a re-pair", () => {
    expect(stateNeedsRePair(state("disconnected", { power: "on" }))).toBe(false);
  });
});
