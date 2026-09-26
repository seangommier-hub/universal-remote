import { HuePairingPendingError } from "../drivers/lighting/hue/HueBridgeClient";
import { HuePairingCancelledError, HuePairingTimedOutError, pairHueWithPolling } from "./huePairing";

const noSleep = async () => {};

describe("pairHueWithPolling", () => {
  test("keeps polling while the link button is unpressed, then returns the username", async () => {
    const pair = jest
      .fn()
      .mockRejectedValueOnce(new HuePairingPendingError("press"))
      .mockRejectedValueOnce(new HuePairingPendingError("press"))
      .mockResolvedValueOnce("bridge-user");
    const onWaitingForButton = jest.fn();

    const username = await pairHueWithPolling({ pair, onWaitingForButton, isCancelled: () => false, sleep: noSleep });

    expect(username).toBe("bridge-user");
    expect(pair).toHaveBeenCalledTimes(3);
    expect(onWaitingForButton).toHaveBeenCalledTimes(2);
  });

  test("waits the polling interval between attempts", async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const pair = jest.fn().mockRejectedValueOnce(new HuePairingPendingError("press")).mockResolvedValueOnce("u");
    await pairHueWithPolling({ pair, onWaitingForButton: () => {}, isCancelled: () => false, sleep, intervalMs: 1500 });
    expect(sleep).toHaveBeenCalledWith(1500);
  });

  test("a real error stops immediately instead of polling", async () => {
    const pair = jest.fn().mockRejectedValue(new Error("bridge unreachable"));
    await expect(pairHueWithPolling({ pair, onWaitingForButton: () => {}, isCancelled: () => false, sleep: noSleep })).rejects.toThrow("bridge unreachable");
    expect(pair).toHaveBeenCalledTimes(1);
  });

  test("stops when cancelled", async () => {
    let cancelled = false;
    const pair = jest.fn().mockImplementation(async () => {
      cancelled = true;
      throw new HuePairingPendingError("press");
    });
    await expect(pairHueWithPolling({ pair, onWaitingForButton: () => {}, isCancelled: () => cancelled, sleep: noSleep })).rejects.toBeInstanceOf(HuePairingCancelledError);
    expect(pair).toHaveBeenCalledTimes(1);
  });

  test("gives up after the maximum wait", async () => {
    const pair = jest.fn().mockRejectedValue(new HuePairingPendingError("press"));
    await expect(
      pairHueWithPolling({ pair, onWaitingForButton: () => {}, isCancelled: () => false, sleep: noSleep, intervalMs: 1000, maxWaitMs: 3000 })
    ).rejects.toBeInstanceOf(HuePairingTimedOutError);
    expect(pair).toHaveBeenCalledTimes(3);
  });
});
