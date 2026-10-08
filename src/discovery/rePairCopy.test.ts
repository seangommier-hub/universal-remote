import { LG_PAIRING_TIMEOUT_MS } from "../drivers/tv/lg/LgWebOsClient";
import { pairingPromptFor } from "./pairingCopy";
import { rePairFailureCopy, rePairOfferCopy } from "./rePairCopy";

describe("rePairOfferCopy", () => {
  test("says plainly that the TV will show an approval box and what to choose", () => {
    const copy = rePairOfferCopy("lg", "LG TV");
    expect(copy.title).toBe("LG TV needs to be re-paired");
    expect(copy.body).toContain('"LG Remote App wants to connect"');
    expect(copy.body).toMatch(/Yes \/ OK/);
    expect(copy.actionLabel).toBe("Re-pair this TV");
  });

  test("promises the name, room and sharing stay as they are", () => {
    expect(rePairOfferCopy("lg", "LG TV").body).toMatch(/name, room and sharing stay the same/);
  });

  test("uses the brand's own prompt sentence from the pairing copy, so it is written once", () => {
    const prompt = pairingPromptFor("lg");
    expect(rePairOfferCopy("lg", "LG TV").body).toContain(prompt!.instruction);
  });

  test("a brand with no waiting prompt still gets a generic instruction", () => {
    expect(rePairOfferCopy("roku", "Roku").body).toMatch(/approve Hearth/);
  });
});

describe("rePairFailureCopy", () => {
  test("a timeout names the choice to tap and reassures that the old pairing was left alone", () => {
    const copy = rePairFailureCopy("lg", "LG TV", new Error("Timed out waiting for pairing approval on the TV — accept the on-screen prompt and try again"));
    expect(copy.title).toBe("No answer from the TV");
    expect(copy.message).toMatch(/Yes \/ OK/);
    expect(copy.message).toMatch(/Nothing was changed: the old pairing is still saved/);
  });

  test("an unknown failure keeps its raw text and still reassures", () => {
    const copy = rePairFailureCopy("lg", "LG TV", new Error("Something odd"));
    expect(copy.message).toContain("Something odd");
    expect(copy.message).toMatch(/old pairing is still saved/);
  });

  test("the countdown the card shows is the driver's real pairing timeout", () => {
    expect(pairingPromptFor("lg")!.timeoutMs).toBe(LG_PAIRING_TIMEOUT_MS);
  });
});
