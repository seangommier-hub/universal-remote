import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { FccUnreachableError } from "../core/network/fccErrors";
import { candidateServers, DEFAULT_RELAY_URL, joinHousehold } from "./joinHousehold";
import { PairCodeInvalidError } from "./pairClient";

const LAN = "http://192.168.1.5:3210";
const PUBLIC = "https://hearth-relay.carddna.app";

function response(status: number, body?: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body ?? {}) };
}

describe("candidateServers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  test("puts the link's server first and falls back to the default relay without duplicates", async () => {
    await expect(candidateServers({ code: "K7M2QX9P", server: `${PUBLIC}/` })).resolves.toEqual([PUBLIC]);
    expect(DEFAULT_RELAY_URL).toBe(PUBLIC);
    await expect(candidateServers({ code: "K7M2QX9P", server: LAN })).resolves.toEqual([LAN, PUBLIC]);
  });
});

describe("joinHousehold", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    global.fetch = jest.fn();
  });

  test("moves past an unreachable server, redeems, then verifies and saves the token", async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce(response(200, { baseUrl: LAN, publicBaseUrl: PUBLIC, token: "tok" }))
      .mockResolvedValue(response(200, { publicBaseUrl: PUBLIC }));

    await joinHousehold({ code: "K7M2QX9P", server: LAN });

    const urls = (global.fetch as jest.Mock).mock.calls.map((call) => call[0]);
    expect(urls[0]).toBe(`${LAN}/api/integrations/hearth/pair/redeem`);
    expect(urls[1]).toBe(`${PUBLIC}/api/integrations/hearth/pair/redeem`);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("hearth.fcc.token", "tok");
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("hearth.fcc.baseUrl", LAN);
  });

  test("stops at a wrong-code answer instead of trying more servers", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(response(400));
    await expect(joinHousehold({ code: "K7M2QX9P", server: LAN })).rejects.toBeInstanceOf(PairCodeInvalidError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("reports unreachable when no server answers", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError("Network request failed"));
    await expect(joinHousehold({ code: "K7M2QX9P", server: LAN })).rejects.toBeInstanceOf(FccUnreachableError);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  test("away from home, verifies over the public host and still saves the LAN address", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response(200, { baseUrl: LAN, publicBaseUrl: PUBLIC, token: "tok" }))
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValue(response(200, {}));

    await joinHousehold({ code: "K7M2QX9P", server: PUBLIC });

    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith("hearth.fcc.publicBaseUrl", PUBLIC);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("hearth.fcc.baseUrl", LAN);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("hearth.fcc.token", "tok");
  });
});
