import { activateRemoteKeepAwake, deactivateRemoteKeepAwake, REMOTE_SCREEN_KEEP_AWAKE_TAG, KeepAwakeControls } from "./useKeepScreenAwake";

// Same pattern as useSwipeBackGesture.test.ts/useNowPlaying.test.ts: the hook's mount/unmount
// wiring is a single, standard useEffect and isn't independently testable without the React
// rendering infra this project doesn't otherwise use for hooks — activateRemoteKeepAwake/
// deactivateRemoteKeepAwake are the real logic (which tag is used, that a rejection is caught and
// logged rather than thrown) and are exercised directly here against a fake `KeepAwakeControls`.

function fakeControls(): KeepAwakeControls & { activate: jest.Mock; deactivate: jest.Mock } {
  return { activate: jest.fn().mockResolvedValue(undefined), deactivate: jest.fn().mockResolvedValue(undefined) };
}

describe("activateRemoteKeepAwake", () => {
  test("activates with the shared remote-screen tag", () => {
    const controls = fakeControls();
    activateRemoteKeepAwake(controls);
    expect(controls.activate).toHaveBeenCalledWith(REMOTE_SCREEN_KEEP_AWAKE_TAG);
    expect(controls.activate).toHaveBeenCalledTimes(1);
  });

  test("does not throw when the platform call rejects", async () => {
    const controls: KeepAwakeControls = { activate: jest.fn().mockRejectedValue(new Error("unsupported")), deactivate: jest.fn() };
    expect(() => activateRemoteKeepAwake(controls)).not.toThrow();
    // Let the rejected promise's .catch() handler run before the test ends.
    await Promise.resolve();
    await Promise.resolve();
  });
});

describe("deactivateRemoteKeepAwake", () => {
  test("deactivates with the same shared tag activateRemoteKeepAwake used", () => {
    const controls = fakeControls();
    deactivateRemoteKeepAwake(controls);
    expect(controls.deactivate).toHaveBeenCalledWith(REMOTE_SCREEN_KEEP_AWAKE_TAG);
    expect(controls.deactivate).toHaveBeenCalledTimes(1);
  });

  test("does not throw when the platform call rejects", async () => {
    const controls: KeepAwakeControls = { activate: jest.fn(), deactivate: jest.fn().mockRejectedValue(new Error("unsupported")) };
    expect(() => deactivateRemoteKeepAwake(controls)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});
