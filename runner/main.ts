import { createHearthRuntime } from "../src/runtime/bootstrap";
import { logger } from "../src/core/logging/logger";
import { loadDevicesFile } from "./devicesFile";
import { DeviceExecutor } from "./executor";
import { LOOPBACK_HOST, createRunnerServer } from "./httpApi";
import { loadRunnerConfig } from "./runnerConfig";
import { setFccConnection } from "./shims/fccConfig";
import { installNodeWebSocket } from "./shims/nodeWebSocket";

const LOG_SCOPE = "Runner";
const DEFAULT_PORT = 3220;

/** Starts the headless runner from environment variables (HEARTH_RUNNER_DEVICES is required). */
async function main(): Promise<void> {
  const devicesPath = process.env.HEARTH_RUNNER_DEVICES;
  if (!devicesPath) throw new Error("HEARTH_RUNNER_DEVICES must point at the devices JSON file");

  installNodeWebSocket();
  setFccConnection(loadRunnerConfig(process.env));
  const executor = new DeviceExecutor(createHearthRuntime(), loadDevicesFile(devicesPath));
  const port = Number(process.env.HEARTH_RUNNER_PORT ?? DEFAULT_PORT);
  const server = createRunnerServer(executor, process.env.HEARTH_RUNNER_SECRET);
  server.listen(port, LOOPBACK_HOST, () => logger.info(LOG_SCOPE, `Listening on ${LOOPBACK_HOST}:${port}`));

  if (process.env.HEARTH_RUNNER_EAGER_CONNECT === "1") void executor.connectAll();

  const stop = () => void executor.shutdown().finally(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  logger.error(LOG_SCOPE, "Runner failed to start", { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
