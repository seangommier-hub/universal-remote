import { CommandValidationError, runCommandTrackingReachability } from "./commandFailure";

describe("runCommandTrackingReachability", () => {
  test("resolves with the command's result and never reports unreachable on success", async () => {
    const onUnreachable = jest.fn();
    await expect(runCommandTrackingReachability(async () => 42, onUnreachable)).resolves.toBe(42);
    expect(onUnreachable).not.toHaveBeenCalled();
  });

  test("reports unreachable and rethrows the original error when the command fails on the wire", async () => {
    const onUnreachable = jest.fn();
    const failure = new Error("network down");
    await expect(
      runCommandTrackingReachability(async () => {
        throw failure;
      }, onUnreachable)
    ).rejects.toBe(failure);
    expect(onUnreachable).toHaveBeenCalledTimes(1);
  });

  test("does not report unreachable for a validation error", async () => {
    const onUnreachable = jest.fn();
    await expect(
      runCommandTrackingReachability(async () => {
        throw new CommandValidationError("bad arg");
      }, onUnreachable)
    ).rejects.toThrow("bad arg");
    expect(onUnreachable).not.toHaveBeenCalled();
  });
});
