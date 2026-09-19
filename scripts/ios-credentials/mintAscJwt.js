// Mints a short-lived App Store Connect API JWT (ES256) from the .p8 key EAS_ASC_* env vars point to.
// Required env vars: EAS_ASC_KEY_ID, EAS_ASC_ISSUER_ID, EAS_ASC_KEY_PATH.
const fs = require("fs");
const crypto = require("crypto");

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// JWS ES256 needs raw 32-byte r||s; Node's crypto.sign gives DER-encoded (r,s) for EC keys.
function derToJoseEcdsaSignature(der) {
  let offset = 2;
  if (der[0] !== 0x30) throw new Error("not a DER sequence");
  if (der[1] & 0x80) offset += der[1] & 0x7f;
  function readInt() {
    if (der[offset] !== 0x02) throw new Error("expected integer");
    const len = der[offset + 1];
    offset += 2;
    let bytes = der.slice(offset, offset + len);
    offset += len;
    bytes = bytes.filter((b, i) => !(i === 0 && b === 0 && bytes.length > 32));
    const padded = Buffer.alloc(32);
    bytes.copy(padded, 32 - bytes.length);
    return padded;
  }
  const r = readInt();
  const s = readInt();
  return Buffer.concat([r, s]);
}

function mintAscJwt() {
  const keyId = requireEnv("EAS_ASC_KEY_ID");
  const issuerId = requireEnv("EAS_ASC_ISSUER_ID");
  const keyPath = requireEnv("EAS_ASC_KEY_PATH");

  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: issuerId, iat: now, exp: now + 1190, aud: "appstoreconnect-v1" };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const privateKey = fs.readFileSync(keyPath, "utf8");
  const derSignature = crypto.sign("sha256", Buffer.from(signingInput), { key: privateKey, dsaEncoding: "der" });
  const joseSignature = derToJoseEcdsaSignature(derSignature);
  return `${signingInput}.${base64url(joseSignature)}`;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

module.exports = { mintAscJwt };

if (require.main === module) {
  console.log(mintAscJwt());
}
