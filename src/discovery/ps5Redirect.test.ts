import { describeRedirectProblem, extractPs5RedirectUrl } from "./ps5Redirect";

const REDIRECT = "https://remoteplay.dl.playstation.net/remoteplay/redirect?code=v3.abc123XYZ&cid=1234";

describe("extractPs5RedirectUrl", () => {
  it("accepts a bare redirect URL", () => {
    expect(extractPs5RedirectUrl(REDIRECT)).toEqual({ kind: "ok", redirectUrl: REDIRECT });
  });

  it("trims surrounding whitespace and newlines", () => {
    expect(extractPs5RedirectUrl(`  \n${REDIRECT}\n `)).toEqual({ kind: "ok", redirectUrl: REDIRECT });
  });

  it("finds the URL inside surrounding pasted text", () => {
    expect(extractPs5RedirectUrl(`Copied: ${REDIRECT} (from Safari)`)).toEqual({ kind: "ok", redirectUrl: REDIRECT });
  });

  it("accepts a code in the fragment", () => {
    const url = "https://example.test/redirect#code=abc";
    expect(extractPs5RedirectUrl(url)).toEqual({ kind: "ok", redirectUrl: url });
  });

  it("reports empty for blank input", () => {
    expect(extractPs5RedirectUrl("   ")).toEqual({ kind: "empty" });
  });

  it("reports no-code for a URL without a code parameter", () => {
    expect(extractPs5RedirectUrl("https://my.account.sony.com/sonyacct/signin")).toEqual({ kind: "no-code" });
  });

  it("does not treat a lookalike parameter such as barcode= as a code", () => {
    expect(extractPs5RedirectUrl("https://example.test/x?barcode=1")).toEqual({ kind: "no-code" });
  });

  it("reports no-code for plain text", () => {
    expect(extractPs5RedirectUrl("hello")).toEqual({ kind: "no-code" });
  });
});

describe("describeRedirectProblem", () => {
  it("explains a no-code paste and stays silent otherwise", () => {
    expect(describeRedirectProblem({ kind: "no-code" })).toMatch(/code=/);
    expect(describeRedirectProblem({ kind: "empty" })).toBeNull();
    expect(describeRedirectProblem({ kind: "ok", redirectUrl: REDIRECT })).toBeNull();
  });
});
