import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { learnPublicUrlIfMissing } from "./learnPublicUrl";

function mockSavedConfig(publicBaseUrl: string | null) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
    if (key === "hearth.fcc.baseUrl") return "http://192.168.1.5:3210";
    if (key === "hearth.fcc.publicBaseUrl") return publicBaseUrl;
    return null;
  });
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("tok");
}

describe("learnPublicUrlIfMissing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  test("saves the server's public address when none is saved", async () => {
    mockSavedConfig(null);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ publicBaseUrl: "https://hearth-relay.carddna.app/" }) });

    await expect(learnPublicUrlIfMissing()).resolves.toBe(true);

    expect(global.fetch).toHaveBeenCalledWith("http://192.168.1.5:3210/api/integrations/hearth/connection-info", expect.anything());
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("hearth.fcc.publicBaseUrl", "https://hearth-relay.carddna.app");
  });

  test("does nothing when a public address is already saved", async () => {
    mockSavedConfig("https://already.example");
    await expect(learnPublicUrlIfMissing()).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("does nothing when this phone is not connected", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    await expect(learnPublicUrlIfMissing()).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("saves nothing when the server has no public address", async () => {
    mockSavedConfig(null);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ publicBaseUrl: null }) });
    await expect(learnPublicUrlIfMissing()).resolves.toBe(false);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  test("stays silent when the server is unreachable", async () => {
    mockSavedConfig(null);
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(learnPublicUrlIfMissing()).resolves.toBe(false);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});
