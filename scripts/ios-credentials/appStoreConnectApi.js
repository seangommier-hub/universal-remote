// Thin wrapper around the App Store Connect API, authenticated with the JWT from mintAscJwt.
const { mintAscJwt } = require("./mintAscJwt");

async function ascApi(method, path, body) {
  const jwt = mintAscJwt();
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`App Store Connect API ${method} ${path} failed (${res.status}): ${text}`);
  }
  return json;
}

module.exports = { ascApi };
