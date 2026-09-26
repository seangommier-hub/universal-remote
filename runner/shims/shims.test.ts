/** @jest-environment node */
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import AsyncStorage, { useAsyncStorageBackend } from "./asyncStorage";
import { randomUUID } from "./expoCrypto";
import { KeyValueStore } from "./keyValueStore";
import { HearthNodeWebSocket, isPrivateNetworkHost } from "./nodeWebSocket";
import { deleteItemAsync, getItemAsync, setItemAsync, useSecureStoreBackend } from "./secureStore";
import unsupportedModule from "./unsupportedModule";
import { loadFamilyCommandCenterConfig, setFccConnection } from "./fccConfig";

function tempFile(name: string): string {
  return join(mkdtempSync(join(tmpdir(), "hearth-runner-")), name);
}

describe("KeyValueStore", () => {
  it("returns null for a missing key and the value after set", () => {
    const store = new KeyValueStore();
    expect(store.get("a")).toBeNull();
    store.set("a", "1");
    expect(store.get("a")).toBe("1");
  });

  it("persists to an owner-only file and reloads it", () => {
    const path = tempFile("kv.json");
    new KeyValueStore(path).set("token", "secret");
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ token: "secret" });
    if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(new KeyValueStore(path).get("token")).toBe("secret");
  });

  it("removes keys from the file too", () => {
    const path = tempFile("kv.json");
    const store = new KeyValueStore(path);
    store.set("a", "1");
    store.remove("a");
    expect(new KeyValueStore(path).get("a")).toBeNull();
  });
});

describe("AsyncStorage and SecureStore shims", () => {
  it("AsyncStorage round-trips through its backend", async () => {
    useAsyncStorageBackend(new KeyValueStore());
    await AsyncStorage.setItem("k", "v");
    expect(await AsyncStorage.getItem("k")).toBe("v");
    await AsyncStorage.removeItem("k");
    expect(await AsyncStorage.getItem("k")).toBeNull();
  });

  it("SecureStore round-trips through its backend", async () => {
    useSecureStoreBackend(new KeyValueStore());
    await setItemAsync("k", "v");
    expect(await getItemAsync("k")).toBe("v");
    await deleteItemAsync("k");
    expect(await getItemAsync("k")).toBeNull();
  });
});

describe("expoCrypto shim", () => {
  it("returns distinct UUID-shaped strings", () => {
    const first = randomUUID();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(randomUUID()).not.toBe(first);
  });
});

describe("unsupportedModule", () => {
  it("throws as soon as anything is used", () => {
    expect(() => (unsupportedModule as { Platform: unknown }).Platform).toThrow(/no headless equivalent/);
  });
});

describe("fccConfig shim", () => {
  it("serves whatever connection was set", async () => {
    setFccConnection({ baseUrl: "http://localhost:3210", token: "t" });
    expect(await loadFamilyCommandCenterConfig()).toEqual({ baseUrl: "http://localhost:3210", token: "t" });
    setFccConnection(null);
    expect(await loadFamilyCommandCenterConfig()).toBeNull();
  });
});

describe("isPrivateNetworkHost", () => {
  it.each(["192.168.1.218", "10.20.30.237", "172.16.0.5", "172.31.255.1", "127.0.0.1", "localhost", "[::1]"])("treats %s as private", (host) => {
    expect(isPrivateNetworkHost(host)).toBe(true);
  });

  it.each(["8.8.8.8", "172.32.0.1", "hearth-ws.example.com", "192.169.1.1"])("treats %s as public", (host) => {
    expect(isPrivateNetworkHost(host)).toBe(false);
  });
});

describe("HearthNodeWebSocket", () => {
  it("speaks the onopen/onmessage/send surface the drivers use, delivering text as a string", async () => {
    const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    server.on("connection", (socket) => socket.on("message", (data) => socket.send(`echo:${data.toString()}`)));
    await new Promise<void>((resolve) => server.on("listening", resolve));
    const { port } = server.address() as AddressInfo;

    const received = await new Promise<unknown>((resolve, reject) => {
      const socket = new HearthNodeWebSocket(`ws://127.0.0.1:${port}`);
      socket.onopen = () => socket.send("hi");
      socket.onmessage = (event) => {
        socket.close();
        resolve(event.data);
      };
      socket.onerror = () => reject(new Error("socket error"));
    });

    server.close();
    expect(received).toBe("echo:hi");
  });
});
