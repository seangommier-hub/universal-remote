import { StateStore } from "./StateStore";

// ADR-HEARTH-183: UniversalTvRemote's initial state is `useState(() => stateStore.get(device.id))`
// — a synchronous read, before any subscription or network refresh — so a device-state snapshot
// cache on remount only works if get() keeps returning the last value set() wrote, independent of
// whether anything is currently subscribed. These tests pin down exactly that guarantee directly
// against the plain store class, without needing to render the screen itself.

describe("StateStore", () => {
  test("get() returns the unknown state for a device that was never set", () => {
    const store = new StateStore();
    // Not toEqual(createUnknownState()) — that stamps its own, separately-read Date.now(), which
    // could tick a millisecond apart from this store's own and make the test flaky.
    expect(store.get("never-seen")).toEqual({ connection: "unknown", values: {}, lastUpdated: expect.any(Number) });
  });

  test("get() keeps returning the last-set state with no subscriber at all", () => {
    const store = new StateStore();
    store.patch("tv-1", { power: "on" });
    expect(store.get("tv-1").values.power).toBe("on");
  });

  test("get() still returns the last-set state after a subscriber unsubscribes (the remote screen's own unmount)", () => {
    const store = new StateStore();
    const unsubscribe = store.subscribe("tv-1", () => {});
    store.patch("tv-1", { power: "on" });
    unsubscribe();
    // Simulates reopening the remote screen: a fresh `useState(() => stateStore.get(device.id))`
    // read, after the previous mount's subscription is long gone.
    expect(store.get("tv-1").values.power).toBe("on");
  });

  test("patch() preserves fields from an earlier patch that the new one doesn't mention", () => {
    const store = new StateStore();
    store.patch("tv-1", { power: "on", volume: 12 });
    store.patch("tv-1", { volume: 14 });
    expect(store.get("tv-1").values).toEqual({ power: "on", volume: 14 });
  });
});
