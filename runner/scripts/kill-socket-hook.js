// Test-only preload (node -r): remembers every TLS socket the runner opens and, on SIGUSR2, kills
// them like a network drop (destroy, no clean close) or on SIGUSR1 stalls them (no reads, so heartbeats time out).
const tls = require("node:tls");

const sockets = new Set();
const realConnect = tls.connect;
tls.connect = function patchedConnect(...args) {
  const socket = realConnect.apply(this, args);
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  return socket;
};

process.on("SIGUSR2", () => {
  console.log(`[kill-hook] destroying ${sockets.size} TLS socket(s) at ${Date.now()}`);
  sockets.forEach((socket) => socket.destroy());
});

process.on("SIGUSR1", () => {
  console.log(`[kill-hook] stalling ${sockets.size} TLS socket(s) at ${Date.now()}`);
  sockets.forEach((socket) => {
    socket.removeAllListeners("data");
    socket.pause();
  });
});
