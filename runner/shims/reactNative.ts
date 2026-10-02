/** The only react-native API the runner's bundle touches: Platform.OS, read by demo-mode and phone-name checks (both false/empty here). */
export const Platform = { OS: "node" as const };

/** haInstanceHub.ts's AppState.addEventListener("change", ...) -- there's no real foreground/
 * background lifecycle in a headless Node process, so this is a safe no-op: the runner process
 * only ever runs for one short on-demand burst (schedule-runner-client.ts) and is never
 * backgrounded, so the listener this attaches would never fire for a real reason anyway. */
export type AppStateStatus = "active" | "background" | "inactive";
export const AppState = {
  addEventListener(_type: "change", _handler: (state: AppStateStatus) => void) {
    return { remove() {} };
  },
};
