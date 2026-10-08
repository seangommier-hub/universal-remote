import { BrandId } from "./brandRegistry";
import { describePairingFailure, pairingPromptFor } from "./pairingCopy";

// ADR-HEARTH-223: the plain-language words of the re-pair card. The brand's own "what will appear on
// the TV" sentence comes from pairingCopy (ADR-HEARTH-155), so it is written once per brand.

export interface RePairOfferCopy {
  title: string;
  body: string;
  actionLabel: string;
}

export interface RePairFailureCopy {
  title: string;
  message: string;
}

const FALLBACK_PROMPT = "The TV will ask you to approve Hearth. Choose Allow / Yes with the TV remote.";
const KEPT_AS_IS = "Nothing was changed: the old pairing is still saved, and Hearth keeps trying in the background.";

/** What the offer says: what went wrong, what the TV will show, and that the name, room and sharing stay as they are. */
export function rePairOfferCopy(brandId: BrandId, brandLabel: string): RePairOfferCopy {
  const prompt = pairingPromptFor(brandId)?.instruction ?? FALLBACK_PROMPT;
  return {
    title: `${brandLabel} needs to be re-paired`,
    body: `It stopped accepting the pairing Hearth saved. Turn it on and keep it in view, then tap Re-pair. ${prompt} Its name, room and sharing stay the same.`,
    actionLabel: "Re-pair this TV",
  };
}

/** Why a re-pair did not finish, in plain words, ending with the reassurance that the old pairing was left alone. */
export function rePairFailureCopy(brandId: BrandId, brandLabel: string, error: unknown): RePairFailureCopy {
  const failure = describePairingFailure(brandId, brandLabel, error);
  return { title: failure.title, message: `${failure.message} ${KEPT_AS_IS}` };
}
