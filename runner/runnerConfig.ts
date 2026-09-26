import { readFileSync } from "node:fs";

/** Where the runner reaches Family Command Center, plus the bearer token. */
export interface FccConnection {
  baseUrl: string;
  token: string;
  publicBaseUrl?: string;
}

export const DEFAULT_FCC_BASE_URL = "http://localhost:3210";

interface RunnerConfigFile {
  baseUrl?: string;
  token?: string;
  publicBaseUrl?: string;
}

function readConfigFile(path: string | undefined): RunnerConfigFile {
  return path ? (JSON.parse(readFileSync(path, "utf8")) as RunnerConfigFile) : {};
}

function resolveToken(env: Record<string, string | undefined>, file: RunnerConfigFile): string | undefined {
  if (env.HEARTH_FCC_TOKEN) return env.HEARTH_FCC_TOKEN;
  if (env.HEARTH_FCC_TOKEN_FILE) return readFileSync(env.HEARTH_FCC_TOKEN_FILE, "utf8").trim();
  return file.token;
}

/**
 * Builds the FCC connection from a JSON file and/or environment (environment wins). The token can
 * come from HEARTH_FCC_TOKEN_FILE so a systemd credential never sits in the process environment.
 * Returns null when no token exists: drivers then run direct-to-device only, without FCC fallbacks.
 */
export function loadRunnerConfig(env: Record<string, string | undefined>): FccConnection | null {
  const file = readConfigFile(env.HEARTH_RUNNER_CONFIG);
  const token = resolveToken(env, file);
  if (!token) return null;
  return {
    baseUrl: env.HEARTH_FCC_BASE_URL ?? file.baseUrl ?? DEFAULT_FCC_BASE_URL,
    token,
    publicBaseUrl: env.HEARTH_FCC_PUBLIC_URL ?? file.publicBaseUrl,
  };
}
