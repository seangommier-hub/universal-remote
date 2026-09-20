import { sendWakeOnLan } from "./wakeOnLan";
import { loadFamilyCommandCenterConfig } from "../../discovery/familyCommandCenterConfig";
import { sendWakeOnLanDirect } from "./wakeOnLanDirect";

jest.mock("../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));

// The direct-from-phone attempt (react-native-jsi-udp, a real native module) has no Jest/Node
// equivalent -- mocked as a module here so these tests can exercise the relay fallback path
// deterministically, same as every other test in this file already assumes. wakeOnLanDirect.test.ts
// covers the direct path's own logic separately with its own mocks.
jest.mock("./wakeOnLanDirect", () => ({
  sendWakeOnLanDirect: jest.fn(),
}));
const mockSendDirect = sendWakeOnLanDirect as jest.MockedFunction<typeof sendWakeOnLanDirect>;

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("sendWakeOnLan", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "test-token" });
    mockSendDirect.mockReset().mockRejectedValue(new Error("direct not reachable in this test")); // falls through to relay by default, matching every existing test below
  });

  test("sends directly from the phone first, without touching Family Command Center at all, when that succeeds", async () => {
    mockSendDirect.mockResolvedValueOnce(undefined);

    await sendWakeOnLan("F8:B9:5A:43:7E:3E");

    expect(mockSendDirect).toHaveBeenCalledWith("F8:B9:5A:43:7E:3E");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("falls back to the relay route when the direct attempt fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ sent: true }));

    await sendWakeOnLan("F8:B9:5A:43:7E:3E");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/wake-on-lan",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        body: JSON.stringify({ macAddress: "F8:B9:5A:43:7E:3E" }),
      })
    );
  });

  test("without Family Command Center configured fails clearly rather than silently no-opping", async () => {
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(null);
    await expect(sendWakeOnLan("F8:B9:5A:43:7E:3E")).rejects.toThrow(/Family Command Center/);
  });

  test("a rejected token surfaces a clear error, not a generic HTTP status", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, false, 401));
    await expect(sendWakeOnLan("F8:B9:5A:43:7E:3E")).rejects.toThrow(/rejected the saved token/);
  });
});
