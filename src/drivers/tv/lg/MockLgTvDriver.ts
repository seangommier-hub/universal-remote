import { createSimulatedTvDriver } from "../SimulatedTvDriver";

/** Simulated LG webOS TV: streaming-only, no tuner (no channel capabilities), faster simulated network latency. */
export const mockLgTvDriver = createSimulatedTvDriver({
  id: "mock-lg-tv",
  displayName: "LG webOS TV (Simulated)",
  capabilities: [
    "power",
    "volumeUp",
    "volumeDown",
    "setVolume",
    "mute",
    "inputSelection",
    "directionalNavigation",
    "select",
    "back",
    "home",
    "menu",
  ],
  simulatedLatencyMs: 90,
});
