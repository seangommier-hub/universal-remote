import { fccJsonRequest } from "../../../core/network/fccJsonRequest";
import { WizApiError, getPilot, setPilot } from "./WizClient";

jest.mock("../../../core/network/fccJsonRequest");
const mockRelay = fccJsonRequest as jest.MockedFunction<typeof fccJsonRequest>;

function relayedBody(): Record<string, unknown> {
  const init = mockRelay.mock.calls[0][1] as RequestInit;
  return JSON.parse(init.body as string);
}

beforeEach(() => mockRelay.mockReset());

describe("getPilot", () => {
  test("asks the proxy for getPilot at the bulb's address and returns the bulb's own fields", async () => {
    mockRelay.mockResolvedValueOnce({ result: { state: true, dimming: 40, mac: "aabbcc" } });

    expect(await getPilot("192.168.1.89")).toEqual({ state: true, dimming: 40, mac: "aabbcc" });
    expect(mockRelay.mock.calls[0][0]).toBe("/api/integrations/hearth/wiz/request");
    expect(relayedBody()).toMatchObject({ ip: "192.168.1.89", method: "getPilot" });
  });

  test("an error reply from the bulb becomes a WizApiError with its message", async () => {
    mockRelay.mockResolvedValueOnce({ error: { code: -32601, message: "Method not found" } });

    await expect(getPilot("192.168.1.89")).rejects.toThrow(/Method not found/);
  });

  test("a reply with neither result nor error is an error, not an empty bulb", async () => {
    mockRelay.mockResolvedValueOnce({});

    await expect(getPilot("192.168.1.89")).rejects.toThrow(WizApiError);
  });
});

describe("setPilot", () => {
  test("sends only the fields to change", async () => {
    mockRelay.mockResolvedValueOnce({ result: { success: true } });

    await setPilot("192.168.1.89", { state: true, dimming: 70 });

    expect(relayedBody()).toMatchObject({ method: "setPilot", params: { state: true, dimming: 70 } });
  });

  test("a bulb that answers success:false is reported as not applied", async () => {
    mockRelay.mockResolvedValueOnce({ result: { success: false } });

    await expect(setPilot("192.168.1.89", { state: false })).rejects.toThrow(/did not apply/);
  });
});
