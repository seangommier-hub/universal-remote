import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { FamilyCommandCenterVerificationError, verifyAndSaveFamilyCommandCenterConfig } from "./familyCommandCenterConfig";

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
