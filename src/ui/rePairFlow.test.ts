import { markNeedsRePair } from "../core/state/needsRePair";
import { DeviceState } from "../core/types/DeviceState";
import { PairingSessionState } from "../discovery/pairingSession";
import { rePairView } from "./rePairFlow";

const FLAGGED: DeviceState = { connection: "disconnected", values: markNeedsRePair({}), lastUpdated: 0 };
const PLAIN_OFFLINE: DeviceState = { connection: "disconnected", values: {}, lastUpdated: 0 };
const CONNECTED: DeviceState = { connection: "connected", values: {}, lastUpdated: 0 };
const IDLE: PairingSessionState = { phase: "idle" };
const WAITING: PairingSessionState = { phase: "waiting", attempt: 1, remainingMs: 20000, totalMs: 30000 };
const FAILED: PairingSessionState = { phase: "failed", error: new Error("Timed out") };
const CONNECTED_SESSION: PairingSessionState = { phase: "connected" };
const CANCELLED: PairingSessionState = { phase: "cancelled" };

describe("rePairView", () => {
  test("a device whose saved pairing was refused is offered a re-pair", () => {
    expect(rePairView({ canRePair: true, state: FLAGGED, session: IDLE })).toBe("offer");
  });

  test("a device that is merely offline (no refusal) is never offered a re-pair", () => {
    expect(rePairView({ canRePair: true, state: PLAIN_OFFLINE, session: IDLE })).toBe("hidden");
  });

  test("a connected device shows nothing", () => {
    expect(rePairView({ canRePair: true, state: CONNECTED, session: IDLE })).toBe("hidden");
  });

  test("nothing is shown when the driver cannot re-pair or the person is not allowed to", () => {
    for (const session of [IDLE, WAITING, FAILED, CONNECTED_SESSION]) {
      expect(rePairView({ canRePair: false, state: FLAGGED, session })).toBe("hidden");
    }
  });

  test("while a re-pair runs the waiting view shows, even though the device reads as offline", () => {
    expect(rePairView({ canRePair: true, state: FLAGGED, session: WAITING })).toBe("waiting");
    expect(rePairView({ canRePair: true, state: PLAIN_OFFLINE, session: WAITING })).toBe("waiting");
  });

  test("a failed re-pair shows its failure with Try again, not the offer", () => {
    expect(rePairView({ canRePair: true, state: FLAGGED, session: FAILED })).toBe("failed");
  });

  test("the Connected! confirmation stays up even though the device is now connected", () => {
    expect(rePairView({ canRePair: true, state: CONNECTED, session: CONNECTED_SESSION })).toBe("connected");
  });

  test("cancelling goes back to the offer while the device is still flagged, and to nothing once it is not", () => {
    expect(rePairView({ canRePair: true, state: FLAGGED, session: CANCELLED })).toBe("offer");
    expect(rePairView({ canRePair: true, state: CONNECTED, session: CANCELLED })).toBe("hidden");
  });
});
