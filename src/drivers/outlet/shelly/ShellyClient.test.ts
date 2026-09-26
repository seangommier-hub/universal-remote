import { requestWithRelayFallback } from "../../../core/network/httpRelayFallback";
import { ShellyApiError, identifyShelly, readRelay, writeRelay } from "./ShellyClient";

jest.mock("../../../core/network/httpRelayFallback");
const mockRequest = requestWithRelayFallback as jest.MockedFunction<typeof requestWithRelayFallback>;

function answer(json: unknown, status = 200) {
  mockRequest.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => json, text: async () => JSON.stringify(json) });
}

function requestedPath(call = 0): string {
  return mockRequest.mock.calls[call][0].path;
}

beforeEach(() => mockRequest.mockReset());

describe("identifyShelly", () => {
  test("a device with a numeric gen above 1 is Gen2+ and reports its model and name", async () => {
    answer({ gen: 2, model: "SNSW-001X16EU", name: "Porch", mac: "AABBCCDDEEFF" });

    expect(await identifyShelly("192.168.1.92")).toEqual({ generation: 2, model: "SNSW-001X16EU", name: "Porch", mac: "AABBCCDDEEFF" });
    expect(mockRequest.mock.calls[0][0]).toMatchObject({ ip: "192.168.1.92", port: 80, method: "GET" });
  });

  test("a /shelly reply with no gen field is Gen1 and reports its type as the model", async () => {
    answer({ type: "SHSW-1", mac: "AABBCCDDEEFF", auth: false });

    expect(await identifyShelly("192.168.1.92")).toMatchObject({ generation: 1, model: "SHSW-1" });
  });
});

describe("readRelay", () => {
  test("Gen1 reads ison from /relay/<channel>", async () => {
    answer({ ison: true });

    expect(await readRelay("192.168.1.92", 1, 1)).toBe(true);
    expect(requestedPath()).toBe("/relay/1");
  });

  test("Gen2 reads output from Switch.GetStatus", async () => {
    answer({ output: false });

    expect(await readRelay("192.168.1.92", 2, 0)).toBe(false);
    expect(requestedPath()).toBe("/rpc/Switch.GetStatus?id=0");
  });

  test("a reply without the relay field is an error, not a guessed off", async () => {
    answer({});

    await expect(readRelay("192.168.1.92", 1, 0)).rejects.toThrow(ShellyApiError);
  });

  test("a 401 says to turn off the Shelly's login", async () => {
    answer({}, 401);

    await expect(readRelay("192.168.1.92", 2, 0)).rejects.toThrow(/login turned on/);
  });

  test("another HTTP failure carries its status", async () => {
    answer({}, 500);

    await expect(readRelay("192.168.1.92", 2, 0)).rejects.toMatchObject({ status: 500 });
  });
});

describe("writeRelay", () => {
  test("Gen1 uses the turn query", async () => {
    answer({});
    answer({});

    await writeRelay("192.168.1.92", 1, 0, true);
    await writeRelay("192.168.1.92", 1, 0, false);

    expect(requestedPath(0)).toBe("/relay/0?turn=on");
    expect(requestedPath(1)).toBe("/relay/0?turn=off");
  });

  test("Gen2 uses Switch.Set with the on flag", async () => {
    answer({});

    await writeRelay("192.168.1.92", 2, 1, false);

    expect(requestedPath()).toBe("/rpc/Switch.Set?id=1&on=false");
  });
});
