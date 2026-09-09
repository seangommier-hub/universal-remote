export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(scope: string, message: string, meta?: Record<string, unknown>): void;
  info(scope: string, message: string, meta?: Record<string, unknown>): void;
  warn(scope: string, message: string, meta?: Record<string, unknown>): void;
  error(scope: string, message: string, meta?: Record<string, unknown>): void;
}

function write(level: LogLevel, scope: string, message: string, meta?: Record<string, unknown>): void {
  const line = `[${level.toUpperCase()}] [${scope}] ${message}`;
  const consoleMethod = level === "debug" ? console.debug : level === "info" ? console.info : level === "warn" ? console.warn : console.error;
  if (meta) {
    consoleMethod(line, meta);
  } else {
    consoleMethod(line);
  }
}

/** Console-backed logger used throughout the app. Swap this implementation for a remote sink later without touching call sites. */
export const logger: Logger = {
  debug: (scope, message, meta) => write("debug", scope, message, meta),
  info: (scope, message, meta) => write("info", scope, message, meta),
  warn: (scope, message, meta) => write("warn", scope, message, meta),
  error: (scope, message, meta) => write("error", scope, message, meta),
};
