// Fast, UI-independent check of whether a real Samsung Tizen TV still accepts the unencrypted
// remote-control WebSocket (ws://<ip>:8001) that src/drivers/tv/samsung/SamsungTizenClient.ts
// uses. Per ADR-HEARTH-005, newer Tizen firmware may only accept the encrypted wss://8002 path,
// which this driver does NOT support yet — this script is exactly how to find out which case
// applies to a specific TV before wiring it into the app. Uses Node's built-in global
// WebSocket (Node 22+) — no extra dependency needed.
//
// Usage:
//   node scripts/test-samsung-connection.js <tv-ip-address>
//
// Watch the TV screen after running this — it will show an Allow/Deny prompt you must accept
// within 20 seconds.

const [, , ipAddress] = process.argv;

if (!ipAddress) {
  console.error("Usage: node scripts/test-samsung-connection.js <tv-ip-address>");
  process.exit(1);
}

const CONNECT_TIMEOUT_MS = 20000;

function encodeAsciiBase64(input) {
  return Buffer.from(input, "ascii").toString("base64");
}

const url = `ws://${ipAddress}:8001/api/v2/channels/samsung.remote.control?name=${encodeAsciiBase64("Hearth")}`;
console.log(`Connecting to ${url}`);
console.log("Watch the TV — accept the on-screen pairing prompt within 20 seconds.");

const socket = new WebSocket(url);

const timeout = setTimeout(() => {
  console.error(
    "\nTimed out waiting for a response. Either the prompt wasn't accepted, or this TV doesn't accept unencrypted port 8001 at all (see ADR-HEARTH-005) — it may require the encrypted wss://8002 path, which this driver doesn't support yet."
  );
  socket.close();
  process.exit(1);
}, CONNECT_TIMEOUT_MS);

socket.onmessage = (event) => {
  let message;
  try {
    message = JSON.parse(String(event.data));
  } catch {
    return;
  }
  if (message.event === "ms.channel.connect") {
    clearTimeout(timeout);
    console.log("\nPairing accepted. Sending a test KEY_MENU keypress...");
    socket.send(
      JSON.stringify({
        method: "ms.remote.control",
        params: { Cmd: "Click", DataOfCmd: "KEY_MENU", Option: "false", TypeOfRemote: "SendRemoteKey" },
      })
    );
    setTimeout(() => {
      console.log("Success — port 8001 works on this TV. Check whether the TV's menu opened.");
      socket.close();
      process.exit(0);
    }, 1000);
  } else if (message.event === "ms.channel.unauthorized") {
    clearTimeout(timeout);
    console.error("\nPairing was denied on the TV.");
    socket.close();
    process.exit(1);
  }
};

socket.onerror = (event) => {
  clearTimeout(timeout);
  console.error(`\nConnection failed: ${event.message || "unknown error"}`);
  console.error(
    "This usually means the TV rejected the unencrypted port 8001 connection outright — likely needs the encrypted wss://8002 path instead (not yet supported, see ADR-HEARTH-005)."
  );
  process.exit(1);
};
