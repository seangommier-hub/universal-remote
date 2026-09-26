/** @jest-environment node */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDevices } from "./devicesFile";
import { DEFAULT_FCC_BASE_URL, loadRunnerConfig } from "./runnerConfig";

function tempFile(name: string, content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "hearth-runner-")), name);
  writeFileSync(path, content);
  return path;
}

describe("loadRunnerConfig", () => {
  it("returns null when no token is configured anywhere", () => {
    expect(loadRunnerConfig({})).toBeNull();
  });

  it("defaults the base URL to the local Family Command Center", () => {
    expect(loadRunnerConfig({ HEARTH_FCC_TOKEN: "t" })).toEqual({ baseUrl: DEFAULT_FCC_BASE_URL, token: "t", publicBaseUrl: undefined });
  });

  it("reads baseUrl and token from a JSON file", () => {
    const file = tempFile("c.json", JSON.stringify({ baseUrl: "http://pi:3210", token: "abc" }));
    expect(loadRunnerConfig({ HEARTH_RUNNER_CONFIG: file })?.baseUrl).toBe("http://pi:3210");
  });

  it("lets the environment override the file, and reads the token from a token file", () => {
    const file = tempFile("c.json", JSON.stringify({ baseUrl: "http://file:3210", token: "from-file" }));
    const tokenFile = tempFile("token", "from-credential\n");
    const config = loadRunnerConfig({ HEARTH_RUNNER_CONFIG: file, HEARTH_FCC_BASE_URL: "http://env:3210", HEARTH_FCC_TOKEN_FILE: tokenFile });
    expect(config).toMatchObject({ baseUrl: "http://env:3210", token: "from-credential" });
  });
});

describe("parseDevices", () => {
  const device = { id: "lg", driverId: "lg-webos-wss3001", capabilities: ["volumeUp"], name: "TV" };

  it("accepts a bare array", () => {
    expect(parseDevices(JSON.stringify([device]))).toHaveLength(1);
  });

  it("accepts the household sync file shape", () => {
    expect(parseDevices(JSON.stringify({ devices: [device], updatedAt: 1 }))).toHaveLength(1);
  });

  it("rejects entries missing required fields", () => {
    expect(() => parseDevices(JSON.stringify([{ id: "x" }]))).toThrow(/entry 0/);
  });

  it("rejects a document with no device list", () => {
    expect(() => parseDevices("{}")).toThrow(/array/);
  });
});
