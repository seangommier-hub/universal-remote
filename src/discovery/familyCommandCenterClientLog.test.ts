import AsyncStorage from "@react-native-async-storage/async-storage";
import { getOrCreateClientLogId, postClientLogBatch } from "./familyCommandCenterClientLog";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";

jest.mock("./familyCommandCenterConfig");
jest.mock("expo-updates", () => ({ runtimeVersion: "1.2.0", updateId: "abcdef123456" }));
const mockLoadConfig = loadFamilyCommandCenterConfig as jest.MockedFunction<typeof loadFamilyCommandCenterConfig>;
const storage = AsyncStorage as unknown as { getItem: jest.Mock; setItem: jest.Mock };
const entries = [{ t: 1, level: "warn" as const, scope: "S", message: "m" }];

beforeEach(() => {
  mockLoadConfig.mockReset();
  storage.getItem.mockReset().mockResolvedValue(null);
  storage.setItem.mockReset();
  global.fetch = jest.fn();
});

test("does not touch the network when Family Command Center is unconfigured", async () => {
  mockLoadConfig.mockResolvedValue(null);
  await expect(postClientLogBatch(entries)).resolves.toBe("unconfigured");
  expect(global.fetch).not.toHaveBeenCalled();
});

test("posts the contract body with the bearer token", async () => {
  mockLoadConfig.mockResolvedValue({ baseUrl: "http://lan:3210", token: "tok" });
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ accepted: 1 }) });
  await expect(postClientLogBatch(entries)).resolves.toBe("sent");
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe("http://lan:3210/api/integrations/hearth/client-log");
  expect(init.headers.Authorization).toBe("Bearer tok");
  const body = JSON.parse(init.body);
  expect(body).toMatchObject({ appVersion: "1.2.0+abcdef12", entries });
  expect(body.clientId.length).toBeLessThanOrEqual(64);
  expect(typeof body.platform).toBe("string");
  expect(init.body).not.toContain("tok");
});

test("falls back to the public address only when the home one is unreachable", async () => {
  mockLoadConfig.mockResolvedValue({ baseUrl: "http://lan:3210", token: "tok", publicBaseUrl: "https://pub" });
  (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({ ok: true });
  await postClientLogBatch(entries);
  expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe("https://pub/api/integrations/hearth/client-log");
});

test("does not fall back when the server rejects the request", async () => {
  mockLoadConfig.mockResolvedValue({ baseUrl: "http://lan:3210", token: "tok", publicBaseUrl: "https://pub" });
  (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });
  await expect(postClientLogBatch(entries)).rejects.toThrow();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test("client id is generated once and reused from storage", async () => {
  const first = await getOrCreateClientLogId();
  expect(storage.setItem).toHaveBeenCalledWith(expect.any(String), first);
  storage.getItem.mockResolvedValue(first);
  await expect(getOrCreateClientLogId()).resolves.toBe(first);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
});
