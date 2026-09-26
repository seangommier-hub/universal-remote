// Spike proof script (ADR-HEARTH-151): drives the runner's local API against a real LG TV and prints latencies.
// usage: node prove-lg.js <deviceId> <runnerPid> [killSignal]
const http = require("node:http");

const [deviceId, runnerPid, killSignal = "SIGUSR2"] = process.argv.slice(2);
const PORT = Number(process.env.HEARTH_RUNNER_PORT || 3220);

function call(method, path, body) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = http.request({ host: "127.0.0.1", port: PORT, method, path }, (res) => {
      let text = "";
      res.on("data", (chunk) => (text += chunk));
      res.on("end", () => resolve({ ms: Date.now() - start, json: JSON.parse(text) }));
    });
    req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

const run = (capability) => call("POST", "/execute", { device: deviceId, command: { capability } });
const summarize = (label, r) => console.log(`${label}: ${r.ms} ms success=${r.json.success} ${r.json.error ? JSON.stringify(r.json.error) : ""}`);

async function main() {
  summarize("volumeUp (cold: includes connect)", await run("volumeUp"));
  summarize("volumeDown (warm)", await run("volumeDown"));
  for (let i = 0; i < 3; i += 1) {
    summarize(`volumeUp warm #${i + 1}`, await run("volumeUp"));
    summarize(`volumeDown warm #${i + 1}`, await run("volumeDown"));
  }
  const before = await call("GET", `/state/${encodeURIComponent(deviceId)}`);
  console.log("state before kill:", before.json.connection, "volume=", before.json.values.volume);

  process.kill(Number(runnerPid), killSignal);
  const killedAt = Date.now();
  let sawDisconnect = false;
  for (;;) {
    const { json } = await call("GET", `/state/${encodeURIComponent(deviceId)}`);
    if (json.connection !== "connected") sawDisconnect = true;
    if (sawDisconnect && json.connection === "connected") break;
    if (Date.now() - killedAt > 120000) return console.log("no reconnect within 120s; last state:", json.connection);
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`reconnected ${Date.now() - killedAt} ms after ${killSignal}`);
  summarize("volumeUp after reconnect", await run("volumeUp"));
  summarize("volumeDown after reconnect", await run("volumeDown"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
