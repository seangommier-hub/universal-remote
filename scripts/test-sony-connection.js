// Fast, UI-independent check that a real Sony BRAVIA TV's REST API is reachable and the
// PSK is correct, before wiring it into the app. Uses the same request shape as
// src/drivers/tv/sony/SonyBraviaClient.ts (kept plain JS here so it runs directly with `node`,
// no build step).
//
// Usage:
//   node scripts/test-sony-connection.js <tv-ip-address> <psk>
//
// Find/set the PSK on the TV: Settings > Network & Internet > Home Network > IP Control >
// Authentication > set to "Pre-Shared Key" and enter one there (exact menu path varies by
// Sony model/firmware year).

const [, , ipAddress, psk] = process.argv;

if (!ipAddress || !psk) {
  console.error("Usage: node scripts/test-sony-connection.js <tv-ip-address> <psk>");
  process.exit(1);
}

async function call(service, method, params = []) {
  const response = await fetch(`http://${ipAddress}/sony/${service}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Auth-PSK": psk },
    body: JSON.stringify({ method, id: 1, params, version: "1.0" }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  if (body.error) {
    throw new Error(`Sony API error ${body.error[0]}: ${body.error[1]}`);
  }
  return body.result;
}

async function main() {
  console.log(`Connecting to Sony BRAVIA at ${ipAddress} ...`);
  const [power] = await call("system", "getPowerStatus");
  console.log("Power status:", power.status);
  const [volume] = await call("audio", "getVolumeInformation");
  console.log("Volume info:", volume);
  console.log("\nSuccess — the driver's request shape and this TV's PSK both work.");
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  console.error("Common causes: TV is off (some models disable IP Control while off), wrong IP, wrong/unset PSK, or IP Control not enabled in TV settings.");
  process.exit(1);
});
