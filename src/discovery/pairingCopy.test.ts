import { FccNotConfiguredError, FccTokenRejectedError } from "../core/network/fccErrors";
import { LG_PAIRING_TIMEOUT_MS, LgUnreachableError } from "../drivers/tv/lg/LgWebOsClient";
import { SAMSUNG_PAIRING_TIMEOUT_MS, SamsungPairingError } from "../drivers/tv/samsung/SamsungTizenClient";
import { BrandId, getBrand } from "./brandRegistry";
import { HUE_PAIRING_MAX_WAIT_MS, HuePairingTimedOutError } from "./huePairing";
import { describePairingFailure, pairingPromptFor } from "./pairingCopy";

const LG_TIMEOUT = "Timed out waiting for pairing approval on the TV — accept the on-screen prompt and try again";
const LG_STALE = "This TV isn't recognizing a previous pairing anymore (its own settings may have been reset or updated) — accept the on-screen prompt to re-approve it";
const LG_CERTIFICATE = "403 Pairing rejected: blacklisted certificate detected";
const NETWORK_FAILED = new Error("Network request failed");

function describe_(brandId: BrandId, error: unknown) {
  return describePairingFailure(brandId, getBrand(brandId).label, error);
}

describe("pairingPromptFor", () => {
  it("uses the drivers' real timeout constants, not copies", () => {
    expect(pairingPromptFor("lg")?.timeoutMs).toBe(LG_PAIRING_TIMEOUT_MS);
    expect(pairingPromptFor("samsung")?.timeoutMs).toBe(SAMSUNG_PAIRING_TIMEOUT_MS);
    expect(pairingPromptFor("hue")?.timeoutMs).toBe(HUE_PAIRING_MAX_WAIT_MS);
  });

  it("tells the user exactly what will appear on the LG TV", () => {
    expect(pairingPromptFor("lg")?.instruction).toContain("LG Remote App wants to connect");
    expect(pairingPromptFor("lg")?.heading).toBe("Look at your LG TV");
  });

  it("has a prompt for every brand with a waiting step and none for the rest", () => {
    for (const id of ["lg", "samsung", "appletv", "hue", "ps5", "ps5-pin", "sony", "xbox", "smartthings"] as const) {
      expect(pairingPromptFor(id)).not.toBeNull();
    }
    expect(pairingPromptFor("roku")).toBeNull();
  });
});

describe("describePairingFailure: LG", () => {
  it("explains a forgotten previous pairing", () => {
    const result = describe_("lg", new Error(LG_STALE));
    expect(result.kind).toBe("stale-pairing");
    expect(result.message).toMatch(/isn't recognizing a previous pairing/);
  });

  it("explains a timeout as not choosing Yes / OK", () => {
    const result = describe_("lg", new Error(LG_TIMEOUT));
    expect(result.kind).toBe("timeout");
    expect(result.message).toMatch(/didn't tap Yes \/ OK/);
  });

  it("explains a rejected certificate", () => {
    const result = describe_("lg", new Error(LG_CERTIFICATE));
    expect(result.kind).toBe("certificate");
    expect(result.message).toMatch(/certificate/i);
  });

  it("falls back to a reachability message for network failures", () => {
    expect(describe_("lg", NETWORK_FAILED).kind).toBe("unreachable");
    expect(describe_("lg", new LgUnreachableError("Network request failed")).kind).toBe("unreachable");
  });
});

describe("describePairingFailure: Samsung", () => {
  it("explains a denied request with the exact Device Manager path", () => {
    const result = describe_("samsung", new SamsungPairingError("Pairing was denied on the TV"));
    expect(result.kind).toBe("not-allowed");
    expect(result.message).toContain("Device Manager > External Device Manager > Device Connect Manager > Access Notification");
    expect(result.message).toContain("First time only");
  });

  it("explains a timeout as not tapping Allow", () => {
    const result = describe_("samsung", new Error(LG_TIMEOUT));
    expect(result.kind).toBe("timeout");
    expect(result.message).toMatch(/didn't tap Allow/);
  });

  it("explains a forgotten previous pairing", () => {
    expect(describe_("samsung", new Error(LG_STALE)).kind).toBe("stale-pairing");
  });

  it("does not claim an unrelated Forbidden error means denial", () => {
    expect(describe_("samsung", new Error("Forbidden")).kind).toBe("unknown");
  });
});

describe("describePairingFailure: Sony", () => {
  it.each(["Sony BRAVIA at 1.2.3.4 returned HTTP 403", "Sony BRAVIA API error 403: Forbidden", "HTTP 401"])("reads %s as a wrong PSK", (text) => {
    const result = describe_("sony", new Error(text));
    expect(result.kind).toBe("wrong-psk");
    expect(result.message).toContain("Settings > Network > Home network setup > IP control > Pre-shared key");
  });

  it("leaves other errors alone", () => {
    expect(describe_("sony", new Error("boom")).kind).toBe("unknown");
  });
});

describe("describePairingFailure: Roku", () => {
  it("explains a 403 with the Permissive network-access path", () => {
    const result = describe_("roku", new Error("Roku at 1.2.3.4 returned HTTP 403 for device-info"));
    expect(result.kind).toBe("roku-permission");
    expect(result.message).toContain("Settings > System > Advanced system settings > Control by mobile apps > Network access > Permissive");
  });

  it("does not blame permissions for a 500", () => {
    expect(describe_("roku", new Error("Roku at 1.2.3.4 returned HTTP 500 for device-info")).kind).toBe("unknown");
  });
});

describe("describePairingFailure: Apple TV", () => {
  it("explains a rejected PIN and asks for the new one", () => {
    const result = describe_("appletv", new Error("Invalid PIN"));
    expect(result.kind).toBe("wrong-pin");
    expect(result.message).toMatch(/new 4-digit PIN/);
  });

  it("explains a timeout", () => {
    expect(describe_("appletv", new Error("Timed out waiting for that step to finish.")).kind).toBe("timeout");
  });

  it("leaves an unrelated error as unknown", () => {
    expect(describe_("appletv", new Error("disk full")).kind).toBe("unknown");
  });
});

describe("describePairingFailure: PS5", () => {
  it("explains a wrong console code", () => {
    expect(describe_("ps5", new Error("Wrong PIN")).kind).toBe("wrong-pin");
  });

  it("explains an unusable sign-in redirect", () => {
    const result = describe_("ps5", new Error("Invalid redirect URL"));
    expect(result.kind).toBe("bad-redirect");
    expect(result.message).toMatch(/copy the whole address/);
  });

  it("explains a timeout", () => {
    expect(describe_("ps5", new Error("Timed out waiting for that step to finish.")).kind).toBe("timeout");
  });
});

describe("describePairingFailure: Hue", () => {
  it("explains the link button not being pressed in time", () => {
    const result = describe_("hue", new HuePairingTimedOutError("x"));
    expect(result.kind).toBe("timeout");
    expect(result.message).toMatch(/round button/);
  });

  it("explains not being on the same network", () => {
    const result = describe_("hue", NETWORK_FAILED);
    expect(result.kind).toBe("not-same-network");
    expect(result.message).toMatch(/same Wi-Fi/);
    expect(result.diagnosis?.kind).toBe("lan-blocked");
  });
});

describe("describePairingFailure: network and Family Command Center failures", () => {
  it.each(["lg", "samsung", "sony", "roku", "appletv", "ps5", "xbox", "smartthings"] as const)("classifies a network failure for %s as unreachable with a diagnosis", (brandId) => {
    const result = describe_(brandId, NETWORK_FAILED);
    expect(["unreachable", "not-same-network"]).toContain(result.kind);
    expect(result.diagnosis?.kind).toBe("lan-blocked");
  });

  it("names Family Command Center problems", () => {
    expect(describe_("smartthings", new FccTokenRejectedError("rejected")).diagnosis?.kind).toBe("rejected-token");
    expect(describe_("ps5", new FccNotConfiguredError("nope")).diagnosis?.kind).toBe("not-configured");
  });

  it("passes an unrecognized error through as unknown with its own text", () => {
    const result = describe_("xbox", new Error("something odd"));
    expect(result.kind).toBe("unknown");
    expect(result.message).toBe("something odd");
  });
});
