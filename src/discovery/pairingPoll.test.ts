import { PairingPollCancelledError, PairingPollTimedOutError, pollPairingStatus } from "./pairingPoll";
import { PairingRunContext } from "./pairingSession";

function context(cancelledAfterSleeps = Infinity): PairingRunContext & { sleeps: number } {
  const state = { sleeps: 0 };
  return {
    isCancelled: () => state.sleeps >= cancelledAfterSleeps,
    sleep: async () => {
      state.sleeps += 1;
    },
    get sleeps() {
      return state.sleeps;
    },
  };
}

const BASE = { target: "success" as const, intervalMs: 1500, maxAttempts: 4, fallbackErrorMessage: "fallback" };

describe("pollPairingStatus", () => {
  it("resolves as soon as the target status is reported, without sleeping first", async () => {
    const ctx = context();
    await pollPairingStatus({ ...BASE, context: ctx, fetchStatus: async () => ({ status: "success" }) });
    expect(ctx.sleeps).toBe(0);
  });

  it("keeps polling through other statuses", async () => {
    const statuses = ["awaiting_pin", "awaiting_pin", "success"] as const;
    let index = 0;
    const ctx = context();
    await pollPairingStatus({ ...BASE, context: ctx, fetchStatus: async () => ({ status: statuses[index++] as string }) });
    expect(ctx.sleeps).toBe(2);
  });

  it("throws the reported error text, or the fallback when there is none", async () => {
    await expect(pollPairingStatus({ ...BASE, context: context(), fetchStatus: async () => ({ status: "error", errorMessage: "bad pin" }) })).rejects.toThrow("bad pin");
    await expect(pollPairingStatus({ ...BASE, context: context(), fetchStatus: async () => ({ status: "error" }) })).rejects.toThrow("fallback");
  });

  it("times out after maxAttempts", async () => {
    await expect(pollPairingStatus({ ...BASE, context: context(), fetchStatus: async () => ({ status: "awaiting_pin" }) })).rejects.toBeInstanceOf(PairingPollTimedOutError);
  });

  it("stops with a cancellation error once the session is cancelled", async () => {
    await expect(pollPairingStatus({ ...BASE, context: context(1), fetchStatus: async () => ({ status: "awaiting_pin" }) })).rejects.toBeInstanceOf(PairingPollCancelledError);
  });
});
