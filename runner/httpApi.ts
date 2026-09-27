import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { normalizeActivity } from "../src/core/activities/activityModel";
import { runActivityHeadless } from "./activityExecution";
import { DeviceExecutor } from "./executor";

export const LOOPBACK_HOST = "127.0.0.1";
export const RUNNER_SECRET_HEADER = "x-hearth-runner-secret";
const MAX_BODY_BYTES = 64 * 1024;
const MAX_ACTIVITY_BODY_BYTES = 512 * 1024;
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_PAYLOAD_TOO_LARGE = 413;

interface ExecuteRequest {
  device: string;
  command: { capability: string; args?: Record<string, unknown> };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, maxBytes: number = MAX_BODY_BYTES): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new RangeError("body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(req: IncomingMessage, res: ServerResponse, maxBytes: number): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readBody(req, maxBytes));
  } catch (err) {
    const tooLarge = err instanceof RangeError;
    sendJson(res, tooLarge ? HTTP_PAYLOAD_TOO_LARGE : HTTP_BAD_REQUEST, { error: tooLarge ? "body too large" : "body must be JSON" });
    return undefined;
  }
}

function isExecuteRequest(value: unknown): value is ExecuteRequest {
  const request = value as Partial<ExecuteRequest> | null;
  return typeof request?.device === "string" && typeof request.command?.capability === "string";
}

async function handleExecute(executor: DeviceExecutor, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req, res, MAX_BODY_BYTES);
  if (body === undefined) return;
  if (!isExecuteRequest(body)) return sendJson(res, HTTP_BAD_REQUEST, { error: "expected {device, command: {capability, args?}}" });
  const result = await executor.execute(body.device, body.command.capability as never, body.command.args);
  sendJson(res, HTTP_OK, result);
}

async function handleRunActivity(executor: DeviceExecutor, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await readJsonBody(req, res, MAX_ACTIVITY_BODY_BYTES)) as { activity?: unknown; runId?: unknown } | undefined;
  if (body === undefined) return;
  const activity = normalizeActivity(body?.activity, new Date().toISOString());
  if (!activity) return sendJson(res, HTTP_BAD_REQUEST, { error: "expected {activity, runId?}" });
  const runId = typeof body?.runId === "string" ? body.runId : undefined;
  sendJson(res, HTTP_OK, await runActivityHeadless(activity, executor, { runId }));
}

function isAuthorized(req: IncomingMessage, secret: string | undefined): boolean {
  return !secret || req.headers[RUNNER_SECRET_HEADER] === secret;
}

/**
 * Creates the runner's HTTP API: POST /execute, POST /run-activity, GET /state/:deviceId, GET /devices. Call listen()
 * on loopback only. When `secret` is set, every request must carry it in the x-hearth-runner-secret header.
 */
export function createRunnerServer(executor: DeviceExecutor, secret?: string): Server {
  return createServer((req, res) => {
    if (!isAuthorized(req, secret)) return sendJson(res, HTTP_UNAUTHORIZED, { error: "unauthorized" });
    const url = new URL(req.url ?? "/", `http://${LOOPBACK_HOST}`);
    if (req.method === "POST" && url.pathname === "/execute") {
      void handleExecute(executor, req, res).catch((err) => sendJson(res, 500, { error: String(err) }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/run-activity") {
      void handleRunActivity(executor, req, res).catch((err) => sendJson(res, 500, { error: String(err) }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/devices") return sendJson(res, HTTP_OK, executor.listDevices());
    const stateMatch = req.method === "GET" ? /^\/state\/([^/]+)$/.exec(url.pathname) : null;
    if (stateMatch) {
      const state = executor.getState(decodeURIComponent(stateMatch[1]));
      return state ? sendJson(res, HTTP_OK, state) : sendJson(res, HTTP_NOT_FOUND, { error: "unknown device" });
    }
    sendJson(res, HTTP_NOT_FOUND, { error: "not found" });
  });
}
