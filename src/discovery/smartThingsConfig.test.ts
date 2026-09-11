import * as SecureStore from "expo-secure-store";
import { clearSmartThingsConfig, loadSmartThingsConfig, saveSmartThingsConfig } from "./smartThingsConfig";

describe("smartThingsConfig", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("saveSmartThingsConfig writes all three fields to SecureStore, never AsyncStorage", async () => {
    await saveSmartThingsConfig({ accessToken: "access-1", refreshToken: "refresh-1", expiresAt: 1234567890 });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("hearth.smartthings.accessToken", "access-1");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("hearth.smartthings.refreshToken", "refresh-1");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("hearth.smartthings.expiresAt", "1234567890");
  });

  test("loadSmartThingsConfig returns the saved config with expiresAt parsed back to a number", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
      const values: Record<string, string> = {
        "hearth.smartthings.accessToken": "access-1",
        "hearth.smartthings.refreshToken": "refresh-1",
        "hearth.smartthings.expiresAt": "1234567890",
      };
      return Promise.resolve(values[key] ?? null);
    });

    expect(await loadSmartThingsConfig()).toEqual({ accessToken: "access-1", refreshToken: "refresh-1", expiresAt: 1234567890 });
  });

  test("loadSmartThingsConfig returns null when nothing has been saved yet", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    expect(await loadSmartThingsConfig()).toBeNull();
  });

  test("loadSmartThingsConfig returns null on a partially-saved config (never a half-usable credential)", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === "hearth.smartthings.accessToken" ? "access-1" : null)
    );

    expect(await loadSmartThingsConfig()).toBeNull();
  });

  test("clearSmartThingsConfig deletes all three keys", async () => {
    await clearSmartThingsConfig();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("hearth.smartthings.accessToken");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("hearth.smartthings.refreshToken");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("hearth.smartthings.expiresAt");
  });
});
