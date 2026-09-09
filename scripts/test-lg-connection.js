// Fast, UI-independent check of whether a real LG webOS TV still accepts the unencrypted SSAP
// WebSocket (ws://<ip>:3000) that src/drivers/tv/lg/LgWebOsClient.ts uses. Per ADR-HEARTH-006,
// TVs from roughly 2023 onward may only accept the encrypted wss://3001 path, which this driver
// does NOT support yet. Uses Node's built-in global WebSocket (Node 22+) — no extra dependency.
//
// Usage:
//   node scripts/test-lg-connection.js <tv-ip-address>
//
// Watch the TV screen after running this — it will show an Allow/Deny pairing prompt you must
// accept within 30 seconds.

const [, , ipAddress] = process.argv;

if (!ipAddress) {
  console.error("Usage: node scripts/test-lg-connection.js <tv-ip-address>");
  process.exit(1);
}

const CONNECT_TIMEOUT_MS = 30000;

// Exact manifest from https://github.com/hobbyquaker/lgtv2/blob/master/pairing.json
const PAIRING_MANIFEST = {
  forcePairing: false,
  pairingType: "PROMPT",
  manifest: {
    manifestVersion: 1,
    appVersion: "1.1",
    signed: {
      created: "20140509",
      appId: "com.lge.test",
      vendorId: "com.lge",
      localizedAppNames: { "": "LG Remote App", "ko-KR": "리모컨 앱", "zxx-XX": "ЛГ Rэмotэ AПП" },
      localizedVendorNames: { "": "LG Electronics" },
      permissions: [
        "TEST_SECURE", "CONTROL_INPUT_TEXT", "CONTROL_MOUSE_AND_KEYBOARD", "READ_INSTALLED_APPS",
        "READ_LGE_SDX", "READ_NOTIFICATIONS", "SEARCH", "WRITE_SETTINGS", "WRITE_NOTIFICATION_ALERT",
        "CONTROL_POWER", "READ_CURRENT_CHANNEL", "READ_RUNNING_APPS", "READ_UPDATE_INFO",
        "UPDATE_FROM_REMOTE_APP", "READ_LGE_TV_INPUT_EVENTS", "READ_TV_CURRENT_TIME",
      ],
      serial: "2f930e2d2cfe083771f68e4fe7bb07",
    },
    permissions: [
      "LAUNCH", "LAUNCH_WEBAPP", "APP_TO_APP", "CLOSE", "TEST_OPEN", "TEST_PROTECTED", "CONTROL_AUDIO",
      "CONTROL_DISPLAY", "CONTROL_INPUT_JOYSTICK", "CONTROL_INPUT_MEDIA_RECORDING", "CONTROL_INPUT_MEDIA_PLAYBACK",
      "CONTROL_INPUT_TV", "CONTROL_POWER", "READ_APP_STATUS", "READ_CURRENT_CHANNEL", "READ_INPUT_DEVICE_LIST",
      "READ_NETWORK_STATE", "READ_RUNNING_APPS", "READ_TV_CHANNEL_LIST", "WRITE_NOTIFICATION_TOAST",
      "READ_POWER_STATE", "READ_COUNTRY_INFO", "READ_SETTINGS", "CONTROL_TV_SCREEN", "CONTROL_TV_STANBY",
      "CONTROL_FAVORITE_GROUP", "CONTROL_USER_INFO", "CHECK_BLUETOOTH_DEVICE", "CONTROL_BLUETOOTH",
      "CONTROL_TIMER_INFO", "STB_INTERNAL_CONNECTION", "CONTROL_RECORDING", "READ_RECORDING_STATE",
      "WRITE_RECORDING_LIST", "READ_RECORDING_LIST", "READ_RECORDING_SCHEDULE", "WRITE_RECORDING_SCHEDULE",
      "READ_STORAGE_DEVICE_LIST", "READ_TV_PROGRAM_INFO", "CONTROL_BOX_CHANNEL", "READ_TV_ACR_AUTH_TOKEN",
      "READ_TV_CONTENT_STATE", "READ_TV_CURRENT_TIME", "ADD_LAUNCHER_CHANNEL", "SET_CHANNEL_SKIP",
      "RELEASE_CHANNEL_SKIP", "CONTROL_CHANNEL_BLOCK", "DELETE_SELECT_CHANNEL", "CONTROL_CHANNEL_GROUP",
      "SCAN_TV_CHANNELS", "CONTROL_TV_POWER", "CONTROL_WOL",
    ],
    signatures: [
      {
        signatureVersion: 1,
        signature:
          "eyJhbGdvcml0aG0iOiJSU0EtU0hBMjU2Iiwia2V5SWQiOiJ0ZXN0LXNpZ25pbmctY2VydCIsInNpZ25hdHVyZVZlcnNpb24iOjF9.hrVRgjCwXVvE2OOSpDZ58hR+59aFNwYDyjQgKk3auukd7pcegmE2CzPCa0bJ0ZsRAcKkCTJrWo5iDzNhMBWRyaMOv5zWSrthlf7G128qvIlpMT0YNY+n/FaOHE73uLrS/g7swl3/qH/BGFG2Hu4RlL48eb3lLKqTt2xKHdCs6Cd4RMfJPYnzgvI4BNrFUKsjkcu+WD4OO2A27Pq1n50cMchmcaXadJhGrOqH5YmHdOCj5NSHzJYrsW0HPlpuAx/ECMeIZYDh6RMqaFM2DXzdKX9NmmyqzJ3o/0lkk/N97gfVRLW5hA29yeAwaCViZNCP8iC9aO0q9fQojoa7NQnAtw==",
      },
    ],
  },
};

console.log(`Connecting to ws://${ipAddress}:3000 ...`);
console.log("Watch the TV — accept the on-screen pairing prompt within 30 seconds.");

const socket = new WebSocket(`ws://${ipAddress}:3000`);
const registerId = "1";

const timeout = setTimeout(() => {
  console.error(
    "\nTimed out. Either the prompt wasn't accepted, or this TV doesn't accept unencrypted port 3000 at all (see ADR-HEARTH-006) — likely needs the encrypted wss://3001 path, which this driver doesn't support yet."
  );
  socket.close();
  process.exit(1);
}, CONNECT_TIMEOUT_MS);

socket.onopen = () => {
  socket.send(JSON.stringify({ type: "register", id: registerId, payload: PAIRING_MANIFEST }));
};

socket.onmessage = (event) => {
  let message;
  try {
    message = JSON.parse(String(event.data));
  } catch {
    return;
  }
  if (message.type === "error") {
    clearTimeout(timeout);
    console.error(`\nError: ${message.error}`);
    socket.close();
    process.exit(1);
    return;
  }
  const clientKey = message.payload && message.payload["client-key"];
  if (typeof clientKey === "string" && clientKey.length > 0) {
    clearTimeout(timeout);
    console.log("\nPairing accepted. Reading volume state (ssap://audio/getVolume)...");
    socket.send(JSON.stringify({ type: "request", id: "2", uri: "ssap://audio/getVolume", payload: {} }));
    return;
  }
  if (message.id === "2") {
    console.log("Volume response:", message.payload);
    console.log("\nSuccess — port 3000 works on this TV.");
    socket.close();
    process.exit(0);
  }
};

socket.onerror = (event) => {
  clearTimeout(timeout);
  console.error(`\nConnection failed: ${event.message || "unknown error"}`);
  console.error("This usually means the TV rejected unencrypted port 3000 outright — likely needs the encrypted wss://3001 path instead (not yet supported, see ADR-HEARTH-006).");
  process.exit(1);
};
