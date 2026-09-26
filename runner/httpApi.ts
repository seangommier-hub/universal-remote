import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { DeviceExecutor } from "./executor";

export const LOOPBACK_HOST = "127.0.0.1";
const MAX_BODY_BYTES = 64 * 1024;
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
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

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new RangeError("body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isExecuteRequest(value: unknown): value is ExecuteRequest {
  const request = value as Partial<ExecuteRequest> | null;
  return typeof request?.device === "string" && typeof request.command?.capability === "string";
}

async function handleExecute(executor: DeviceExecutor, req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown;
  try {
    body = JSON.parse(await readBody(req));
  } catch (err) {
    const tooLarge = err instanceof RangeError;
    return sendJson(res, tooLarge ? HTTP_PAYLOAD_TOO_LARGE : HTTP_BAD_REQUEST, { error: tooLarge ? "body too large" : "body must be JSON" });
  }
  if (!isExecuteRequest(body)) return sendJson(res, HTTP_BAD_REQUEST, { error: "expected {device, command: {capability, args?}}" });
  const result = await executor.execute(body.device, body.command.capability as never, body.command.args);
  sendJson(res, HTTP_OK, result);
}

/** Creates the runner's HTTP API: POST /execute, GET /state/:deviceId, GET /devices. Call listen() on loopback only. */
export function createRunnerServer(executor: DeviceExecutor): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${LOOPBACK_HOST}`);
    if (req.method === "POST" && url.pathname === "/execute") {
      void handleExecute(executor, req, res).catch((err) => sendJson(res, 500, { error: String(err) }));
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
