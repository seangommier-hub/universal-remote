import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { clearHaOAuthState, hydrateHaOAuthStates, saveHaOAuthState } from "./haOAuthStateStore";
import { getHaOAuthState, resetHaOAuthStatesForTests } from "./haOAuthStateRegistry";

describe("haOAuthStateStore", () => {
  let asyncStore: Record<string, string>;
  let secureStore: Record<string, string>;

  beforeEach(() => {
    resetHaOAuthStatesForTests();
    asyncStore = {};
    secureStore = {};
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => asyncStore[key] ?? null);
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
      asyncStore[key] = value;
    });
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => secureStore[key] ?? null);
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
      secureStore[key] = value;
    });
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => {
      delete secureStore[key];
    });
  });

  test("saveHaOAuthState writes the refresh token to secure storage and everything else to plain storage", async () => {
    await saveHaOAuthState({ instanceId: "ha-1", refreshToken: "rt-secret", issuedAt: 100, expiresAt: 2000, needsSignIn: false });

    expect(Object.values(secureStore)).toContain("rt-secret");
    const metadataRaw = asyncStore["hearth.haOAuthStates.v1"];
    expect(JSON.parse(metadataRaw)["ha-1"]).toEqual({ issuedAt: 100, expiresAt: 2000, needsSignIn: false });
    expect(JSON.stringify(asyncStore)).not.toContain("rt-secret");
    expect(getHaOAuthState("ha-1")).toMatchObject({ refreshToken: "rt-secret" });
  });

  test("hydrateHaOAuthStates rebuilds every saved instance's state into the registry", async () => {
    await saveHaOAuthState({ instanceId: "ha-1", refreshToken: "rt-1", issuedAt: 1, expiresAt: 2, needsSignIn: false });
    await saveHaOAuthState({ instanceId: "ha-2", refreshToken: "rt-2", issuedAt: 3, expiresAt: 4, needsSignIn: true });
    resetHaOAuthStatesForTests();

    const loaded = await hydrateHaOAuthStates();

    expect(loaded).toHaveLength(2);
    expect(getHaOAuthState("ha-1")).toMatchObject({ refreshToken: "rt-1", needsSignIn: false });
    expect(getHaOAuthState("ha-2")).toMatchObject({ refreshToken: "rt-2", needsSignIn: true });
  });

  test("hydrateHaOAuthStates skips an instance whose secure-storage entry is gone", async () => {
    await saveHaOAuthState({ instanceId: "ha-1", refreshToken: "rt-1", issuedAt: 1, expiresAt: 2, needsSignIn: false });
    delete secureStore["hearth.ha.instance.ha-1.oauthRefreshToken"];
    resetHaOAuthStatesForTests();

    const loaded = await hydrateHaOAuthStates();
    expect(loaded).toHaveLength(0);
  });

  test("clearHaOAuthState removes both the secret and the metadata entry", async () => {
    await saveHaOAuthState({ instanceId: "ha-1", refreshToken: "rt-1", issuedAt: 1, expiresAt: 2, needsSignIn: false });
    await clearHaOAuthState("ha-1");
    resetHaOAuthStatesForTests();
    expect(await hydrateHaOAuthStates()).toHaveLength(0);
  });
});
