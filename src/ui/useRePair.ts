import { Device } from "../core/types/Device";
import { DeviceState } from "../core/types/DeviceState";
import { brandForDriverId } from "../discovery/brandRegistry";
import { PairingPrompt, pairingPromptFor } from "../discovery/pairingCopy";
import { PairingSessionState } from "../discovery/pairingSession";
import { RePairFailureCopy, RePairOfferCopy, rePairFailureCopy, rePairOfferCopy } from "../discovery/rePairCopy";
import { RePairView, rePairView } from "./rePairFlow";
import { usePairingSession } from "./usePairingSession";

// ADR-HEARTH-223: owns the one pairing session behind a remote screen's re-pair card. The re-pair
// itself only ever starts from `start`, which the card calls from a button; nothing here runs on
// its own.

interface UseRePairInput {
  device: Device;
  state: DeviceState;
  /** Runs the driver's re-pair and saves the result; omitted when this device (or this person) cannot re-pair. */
  onRePair?: () => Promise<void>;
}

export interface RePairControls {
  view: RePairView;
  offer: RePairOfferCopy | null;
  failure: RePairFailureCopy | null;
  prompt: PairingPrompt | null;
  session: PairingSessionState;
  start: () => void;
  retry: () => void;
  cancel: () => void;
}

/** The re-pair card's view, plain-language copy and actions for one device. */
export function useRePair({ device, state, onRePair }: UseRePairInput): RePairControls {
  const pairing = usePairingSession();
  const brand = brandForDriverId(device.driverId);
  const canRePair = onRePair !== undefined && brand !== undefined;
  const view = rePairView({ canRePair, state, session: pairing.state });
  const prompt = brand ? pairingPromptFor(brand.id) : null;
  const failedError = pairing.state.phase === "failed" ? pairing.state.error : null;

  function start(): void {
    if (!onRePair) return;
    pairing.start({
      totalMs: prompt?.timeoutMs ?? null,
      run: () => onRePair(),
      // After the brief "Connected!" the card steps aside; a cancelled session is the idle state the view treats as "nothing running".
      onDone: () => pairing.cancel(),
    });
  }

  return {
    view,
    offer: brand ? rePairOfferCopy(brand.id, brand.label) : null,
    failure: brand && failedError !== null ? rePairFailureCopy(brand.id, brand.label, failedError) : null,
    prompt,
    session: pairing.state,
    start,
    retry: pairing.retry,
    cancel: pairing.cancel,
  };
}
