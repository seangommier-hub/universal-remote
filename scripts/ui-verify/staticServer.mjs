import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".css": "text/css",
};

/** Serves a static export folder with single-page fallback to index.html; resolves to { url, close }. */
export function serveDirectory(root) {
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const safePath = normalize(pathname).replace(/^([/\\])+/, "");
    try {
      const body = await readFile(join(root, safePath));
      response.writeHead(200, { "Content-Type": MIME_TYPES[extname(safePath)] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
      response.end(await readFile(join(root, "index.html")));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() });
    });
  });
}
