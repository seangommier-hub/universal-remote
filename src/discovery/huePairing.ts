import { HuePairingPendingError } from "../drivers/lighting/hue/HueBridgeClient";

// ADR-HEARTH-148: the Hue bridge answers "link button not pressed" until someone presses it. The
// old screen treated that as the end of the attempt and silently reset the form; pairing now keeps
// polling until the button is pressed, the user cancels, or a generous ceiling passes.

export const HUE_PAIRING_POLL_INTERVAL_MS = 2000;
export const HUE_PAIRING_MAX_WAIT_MS = 60000;
export const HUE_LINK_BUTTON_PROMPT = "Press the link button on the bridge";

export class HuePairingTimedOutError extends Error {}
export class HuePairingCancelledError extends Error {}

export interface HuePairingOptions {
  pair: () => Promise<string>;
  /** Called each time the bridge says the button has not been pressed yet. */
  onWaitingForButton: () => void;
  isCancelled: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  intervalMs?: number;
  maxWaitMs?: number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Pairs with the bridge, retrying while the link button has not been pressed; resolves to the bridge username. */
export async function pairHueWithPolling(options: HuePairingOptions): Promise<string> {
  const { pair, onWaitingForButton, isCancelled, sleep = realSleep, intervalMs = HUE_PAIRING_POLL_INTERVAL_MS, maxWaitMs = HUE_PAIRING_MAX_WAIT_MS } = options;
  const maxAttempts = Math.max(1, Math.ceil(maxWaitMs / intervalMs));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (isCancelled()) throw new HuePairingCancelledError("Pairing cancelled.");
    try {
      return await pair();
    } catch (error) {
      if (!(error instanceof HuePairingPendingError)) throw error;
      onWaitingForButton();
      await sleep(intervalMs);
    }
  }
  throw new HuePairingTimedOutError("The link button wasn't pressed in time. Press it and try again.");
}
