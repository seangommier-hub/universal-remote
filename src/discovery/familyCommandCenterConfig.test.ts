import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import {
  FamilyCommandCenterVerificationError,
  loadFamilyCommandCenterConfig,
  saveOwnRole,
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

  // ADR-HEARTH-181 phase 1: manual entry / QR scan always saves a "legacy" token kind by default,
  // since only pair/redeem ever hands out a personal one.
  test("defaults the saved token kind to legacy when the caller doesn't say otherwise", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 });

    await verifyAndSaveFamilyCommandCenterConfig("http://192.168.1.172:3210", "secret-token");

    expect(AsyncStorage.setItem).toHaveBeenCalledWith("hearth.fcc.tokenKind", "legacy");
  });

  test("saves the token kind the caller passes", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 });

    await verifyAndSaveFamilyCommandCenterConfig("http://192.168.1.172:3210", "secret-token", "personal");

    expect(AsyncStorage.setItem).toHaveBeenCalledWith("hearth.fcc.tokenKind", "personal");
  });

  test("rejects and does not save when the server rejects the token", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });

    await expect(verifyAndSaveFamilyCommandCenterConfig("http://192.168.1.172:3210", "wrong-token")).rejects.toThrow(/rejected/);

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  test("rejects with a timeout instead of hanging when the server never answers", async () => {
    jest.useFakeTimers();
    try {
      global.fetch = jest.fn(() => new Promise<Response>(() => {}));

      const pending = verifyAndSaveFamilyCommandCenterConfig("http://192.168.1.172:3210", "secret-token");
      const assertion = expect(pending).rejects.toThrow(/192\.168\.1\.172:3210 timed out after 8 seconds/);
      await jest.advanceTimersByTimeAsync(8000);

      await assertion;
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
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

  // ADR-HEARTH-181 phase 1: a config saved before tokenKind existed reads back as undefined, which
  // every caller treats the same as "legacy" (see tokenUpgrade.ts).
  test("loadFamilyCommandCenterConfig returns tokenKind as undefined when none was ever saved", async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => Promise.resolve(key === "hearth.fcc.baseUrl" ? "http://192.168.1.172:3210" : null));
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("secret-token");

    expect((await loadFamilyCommandCenterConfig())?.tokenKind).toBeUndefined();
  });

  test("loadFamilyCommandCenterConfig reads back a saved personal token kind", async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === "hearth.fcc.baseUrl" ? "http://192.168.1.172:3210" : key === "hearth.fcc.tokenKind" ? "personal" : null)
    );
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("secret-token");

    expect((await loadFamilyCommandCenterConfig())?.tokenKind).toBe("personal");
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

// ADR-HEARTH-189, phase 2: this phone's own cached household role.
describe("role (ADR-HEARTH-189)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("loadFamilyCommandCenterConfig returns role as undefined when none was ever saved", async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => Promise.resolve(key === "hearth.fcc.baseUrl" ? "http://192.168.1.172:3210" : null));
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("secret-token");

    expect((await loadFamilyCommandCenterConfig())?.role).toBeUndefined();
  });

  test("loadFamilyCommandCenterConfig reads back a saved role", async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === "hearth.fcc.baseUrl" ? "http://192.168.1.172:3210" : key === "hearth.fcc.role" ? "guest" : null)
    );
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("secret-token");

    expect((await loadFamilyCommandCenterConfig())?.role).toBe("guest");
  });

  test("saveOwnRole attaches a role to an already-saved config", async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => Promise.resolve(key === "hearth.fcc.baseUrl" ? "http://192.168.1.172:3210" : null));
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("secret-token");

    await expect(saveOwnRole("owner")).resolves.toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("hearth.fcc.role", "owner");
  });

  test("saveOwnRole is a no-op, returning false, when there's no saved config yet", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    await expect(saveOwnRole("owner")).resolves.toBe(false);
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith("hearth.fcc.role", expect.anything());
  });
});
