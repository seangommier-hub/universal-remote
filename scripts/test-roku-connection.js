// Fast, UI-independent check that a real Roku device's External Control Protocol (ECP) is
// reachable — no pairing, no auth, unlike the Samsung/LG scripts. Mirrors the request shape in
// src/drivers/streaming/roku/RokuEcpClient.ts.
//
// Usage:
//   node scripts/test-roku-connection.js <roku-ip-address>

const [, , ipAddress] = process.argv;

if (!ipAddress) {
  console.error("Usage: node scripts/test-roku-connection.js <roku-ip-address>");
  process.exit(1);
}

function extractXmlTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match ? match[1] : undefined;
}

async function main() {
  const base = `http://${ipAddress}:8060`;
  console.log(`Querying device-info at ${base}/query/device-info ...`);
  const infoResponse = await fetch(`${base}/query/device-info`);
  if (!infoResponse.ok) {
    throw new Error(`HTTP ${infoResponse.status}`);
  }
  const xml = await infoResponse.text();
  const powerMode = extractXmlTag(xml, "power-mode");
  const modelName = extractXmlTag(xml, "model-name");
  console.log(`Model: ${modelName ?? "(unknown)"}  Power: ${powerMode ?? "(unknown)"}`);

  console.log("\nSending a test Home keypress...");
  const keypressResponse = await fetch(`${base}/keypress/Home`, { method: "POST" });
  if (!keypressResponse.ok) {
    throw new Error(`Keypress HTTP ${keypressResponse.status}`);
  }
  console.log("Success — check whether the device's home screen appeared.");
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  console.error("Common causes: wrong IP, device not on the same network, or ECP disabled in Settings > System > Advanced system settings > Control by mobile apps.");
  process.exit(1);
});
