import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { candidateServers, DEFAULT_RELAY_URL, joinHousehold } from "./joinHousehold";
import { buildJoinConfirmation, previewJoin } from "./joinPreview";
import { publishDevices } from "./familyCommandCenterDeviceSync";
import { PairResponseRejectedError } from "./redeemResponse";
import { Device } from "../core/types/Device";

const LAN = "http://192.168.1.5:3210";
const EVIL = "https://evil.example";
const SAVED_LAN = "http://192.168.1.99:3210";

function response(status: number, body?: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body ?? {}) };
}

function mockSavedHousehold(saved: { baseUrl: string; publicBaseUrl?: string; token: string } | null) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
    if (!saved) return null;
    if (key === "hearth.fcc.baseUrl") return saved.baseUrl;
    if (key === "hearth.fcc.publicBaseUrl") return saved.publicBaseUrl ?? null;
    return null;
  });
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(saved?.token ?? null);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSavedHousehold(null);
  global.fetch = jest.fn();
});

describe("candidateServers with hostile link servers", () => {
  test("ignores an untrusted server and falls back to the default relay", async () => {
    await expect(candidateServers({ code: "ABCD1234", server: EVIL })).resolves.toEqual([DEFAULT_RELAY_URL]);
    await expect(candidateServers({ code: "ABCD1234", server: "http://hearth-relay.carddna.app" })).resolves.toEqual([DEFAULT_RELAY_URL]);
  });

  test("falls back to the saved addresses first when the link's server is untrusted", async () => {
    mockSavedHousehold({ baseUrl: SAVED_LAN, token: "old" });
    await expect(candidateServers({ code: "ABCD1234", server: EVIL })).resolves.toEqual([SAVED_LAN, DEFAULT_RELAY_URL]);
  });

  test("honors a server equal to the saved host over https", async () => {
    mockSavedHousehold({ baseUrl: SAVED_LAN, publicBaseUrl: "https://home.example.org", token: "old" });
    const servers = await candidateServers({ code: "ABCD1234", server: "https://home.example.org/" });
    expect(servers[0]).toBe("https://home.example.org");
  });
});

describe("joinHousehold would-replace", () => {
  test("refuses to replace a saved household without confirmation and touches nothing", async () => {
    mockSavedHousehold({ baseUrl: SAVED_LAN, token: "old" });
    const result = await joinHousehold({ code: "ABCD1234", server: LAN });
    expect(result).toEqual({ status: "would-replace", currentHost: "192.168.1.99" });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  test("replaces the saved household once the caller confirms", async () => {
    mockSavedHousehold({ baseUrl: SAVED_LAN, token: "old" });
    (global.fetch as jest.Mock).mockResolvedValueOnce(response(200, { baseUrl: LAN, token: "new" })).mockResolvedValue(response(200, {}));
    await expect(joinHousehold({ code: "ABCD1234", server: LAN }, { confirmedReplace: true })).resolves.toEqual({ status: "joined" });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("hearth.fcc.token", "new");
  });

  test("joins a fresh phone with no confirmation flag", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(response(200, { baseUrl: LAN, token: "tok" })).mockResolvedValue(response(200, {}));
    await expect(joinHousehold({ code: "ABCD1234", server: LAN })).resolves.toEqual({ status: "joined" });
  });
});

describe("attacker server cannot redirect or take over", () => {
  test("a hostile link server is never contacted", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError("Network request failed"));
    await expect(joinHousehold({ code: "ABCD1234", server: EVIL })).rejects.toBeDefined();
    const urls = (global.fetch as jest.Mock).mock.calls.map((call) => String(call[0]));
    expect(urls.every((url) => !url.includes("evil.example"))).toBe(true);
  });

  test("a trusted server answering with an attacker baseUrl saves nothing", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response(200, { baseUrl: EVIL, token: "stolen" }));
    await expect(joinHousehold({ code: "ABCD1234", server: LAN })).rejects.toBeInstanceOf(PairResponseRejectedError);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  test("an attacker publicBaseUrl in the answer saves nothing", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response(200, { baseUrl: LAN, publicBaseUrl: EVIL, token: "tok" }));
    await expect(joinHousehold({ code: "ABCD1234", server: LAN })).rejects.toBeInstanceOf(PairResponseRejectedError);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});

describe("previewJoin and the confirmation wording", () => {
  test("names the host that will be contacted", async () => {
    const preview = await previewJoin({ code: "ABCD1234", server: EVIL });
    expect(preview).toEqual({ host: "hearth-relay.carddna.app", currentHost: null });
    expect(buildJoinConfirmation(preview).message).toContain("hearth-relay.carddna.app");
  });

  test("warns that a saved household will be replaced", async () => {
    mockSavedHousehold({ baseUrl: SAVED_LAN, token: "old" });
    const preview = await previewJoin({ code: "ABCD1234", server: LAN });
    expect(preview.host).toBe("192.168.1.5");
    expect(buildJoinConfirmation(preview).message).toContain("This will replace your current household connection (192.168.1.99)");
  });
});

describe("pairing keys only go to the saved household host", () => {
  test("publishDevices sends every request to the saved host and no other", async () => {
    mockSavedHousehold({ baseUrl: SAVED_LAN, publicBaseUrl: "https://hearth-relay.carddna.app", token: "tok" });
    (global.fetch as jest.Mock).mockResolvedValue(response(200, { count: 1 }));
    const tv = { id: "tv", name: "TV", pairingKey: "SECRET-CLIENT-KEY" } as unknown as Device;
    await publishDevices([tv]);
    const urls = (global.fetch as jest.Mock).mock.calls.map((call) => String(call[0]));
    expect(urls.length).toBeGreaterThan(0);
    urls.forEach((url) => expect(["192.168.1.99", "hearth-relay.carddna.app"]).toContain(new URL(url).host.replace(/:\d+$/, "")));
  });
});
