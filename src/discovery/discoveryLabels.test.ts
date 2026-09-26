import { buildLabelPayload, labelKey, parseLabels, pushLabelToPi, withLabel } from "./discoveryLabels";
import { fccFetch } from "../core/network/fccRequest";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";

jest.mock("../core/network/fccRequest", () => ({ fccFetch: jest.fn() }));
jest.mock("./familyCommandCenterConfig", () => ({ loadFamilyCommandCenterConfig: jest.fn() }));

const mockFetch = fccFetch as jest.Mock;
const mockConfig = loadFamilyCommandCenterConfig as jest.Mock;

describe("labelKey", () => {
  test("prefers the MAC, since addresses change", () => {
    expect(labelKey({ mac: "aa:bb", ip: "192.168.1.5" })).toBe("aa:bb");
    expect(labelKey({ mac: null, ip: "192.168.1.5" })).toBe("192.168.1.5");
  });
});

describe("parseLabels", () => {
  test("round-trips good data and drops anything malformed", () => {
    const raw = JSON.stringify({ a: { hidden: true }, b: { brand: "roku" }, c: { brand: "toaster" }, d: "x", e: { hidden: "yes" } });
    expect(parseLabels(raw)).toEqual({ a: { hidden: true }, b: { brand: "roku" } });
  });

  test("survives missing, corrupt or non-object storage", () => {
    expect(parseLabels(null)).toEqual({});
    expect(parseLabels("{nope")).toEqual({});
    expect(parseLabels("[1,2]")).toEqual({});
  });
});

describe("withLabel", () => {
  test("merges into an existing entry without mutating the original", () => {
    const before = { a: { hidden: true } };
    const after = withLabel(before, "a", { brand: "lg" });
    expect(after).toEqual({ a: { hidden: true, brand: "lg" } });
    expect(before).toEqual({ a: { hidden: true } });
  });
});

describe("buildLabelPayload", () => {
  test("includes only what was decided", () => {
    expect(buildLabelPayload({ id: "n1" }, { hidden: true })).toEqual({ id: "n1", hidden: true });
    expect(buildLabelPayload({ id: "n1" }, { brand: "roku" })).toEqual({ id: "n1", brand: "roku" });
  });
});

describe("pushLabelToPi", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockConfig.mockReset();
  });

  test("PUTs the label through the shared FCC client", async () => {
    mockConfig.mockResolvedValue({ baseUrl: "http://pi", token: "t" });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await pushLabelToPi({ id: "n1" }, { hidden: true });
    expect(mockFetch).toHaveBeenCalledWith(expect.anything(), "/api/integrations/hearth/discover/labels", { method: "PUT", body: JSON.stringify({ id: "n1", hidden: true }) });
  });

  test("does nothing without a Family Command Center, and never throws on a 404 or a network failure", async () => {
    mockConfig.mockResolvedValue(null);
    await expect(pushLabelToPi({ id: "n1" }, { hidden: true })).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();

    mockConfig.mockResolvedValue({ baseUrl: "http://pi", token: "t" });
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(pushLabelToPi({ id: "n1" }, { hidden: true })).resolves.toBeUndefined();
    mockFetch.mockRejectedValue(new Error("offline"));
    await expect(pushLabelToPi({ id: "n1" }, { hidden: true })).resolves.toBeUndefined();
  });
});
