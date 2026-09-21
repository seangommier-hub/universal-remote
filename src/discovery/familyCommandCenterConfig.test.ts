import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import {
  FamilyCommandCenterVerificationError,
  loadFamilyCommandCenterConfig,
  verifyAndSaveFamilyCommandCenterConfig,
  verifyAndSavePublicUrl,
} from "./familyCommandCenterConfig";

describe("verifyAndSaveFamilyCommandCenterConfig", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  test("verifies with a real authenticated request before saving anything", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 });

    await verifyAndSaveFamilyCommandCenterConfig("http://192.168.1.172:3210/", " secret-token ");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.172:3210/api/integrations/hearth/devices",
      expect.objectContaining({ headers: { Authorization: "Bearer secret-token" } })
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("hearth.fcc.baseUrl", "http://192.168.1.172:3210");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("hearth.fcc.token", "secret-token");
  });

  test("rejects and does not save when the server rejects the token", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });

    await expect(verifyAndSaveFamilyCommandCenterConfig("http://192.168.1.172:3210", "wrong-token")).rejects.toThrow(/rejected/);

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  test("rejects with a FamilyCommandCenterVerificationError instance on empty fields, without making a request", async () => {
    await expect(verifyAndSaveFamilyCommandCenterConfig("", "")).rejects.toBeInstanceOf(FamilyCommandCenterVerificationError);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// Real ask (2026-09-21, ADR-HEARTH-123): "this should be something that can still be used even
// when off network."
describe("loadFamilyCommandCenterConfig / verifyAndSavePublicUrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  test("loadFamilyCommandCenterConfig returns publicBaseUrl as undefined when none was ever saved", async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => Promise.resolve(key === "hearth.fcc.baseUrl" ? "http://192.168.1.172:3210" : null));
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("secret-token");

    const config = await loadFamilyCommandCenterConfig();

    expect(config?.publicBaseUrl).toBeUndefined();
  });

  test("verifyAndSavePublicUrl verifies the public URL with the already-saved token before saving it", async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => Promise.resolve(key === "hearth.fcc.baseUrl" ? "http://192.168.1.172:3210" : null));
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("secret-token");
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 });

    await verifyAndSavePublicUrl("https://hearth-relay.carddna.app/");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://hearth-relay.carddna.app/api/integrations/hearth/devices",
      expect.objectContaining({ headers: { Authorization: "Bearer secret-token" } })
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("hearth.fcc.publicBaseUrl", "https://hearth-relay.carddna.app");
  });

  test("verifyAndSavePublicUrl with an empty string clears a previously-saved public URL, without making a request", async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => Promise.resolve(key === "hearth.fcc.baseUrl" ? "http://192.168.1.172:3210" : null));
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("secret-token");

    await verifyAndSavePublicUrl("");

    expect(global.fetch).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("hearth.fcc.publicBaseUrl");
  });

  test("verifyAndSavePublicUrl rejects if the LAN address/token haven't been set up yet", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    await expect(verifyAndSavePublicUrl("https://hearth-relay.carddna.app")).rejects.toBeInstanceOf(FamilyCommandCenterVerificationError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("verifyAndSavePublicUrl does NOT save when the public URL rejects the token", async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => Promise.resolve(key === "hearth.fcc.baseUrl" ? "http://192.168.1.172:3210" : null));
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("secret-token");
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });

    await expect(verifyAndSavePublicUrl("https://hearth-relay.carddna.app")).rejects.toThrow(/rejected/);
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith("hearth.fcc.publicBaseUrl", expect.anything());
  });
});
