import { createSimulatedTvDriver } from "../SimulatedTvDriver";

/** Simulated Samsung TV: has a tuner (channel up/down), moderate simulated network latency. */
export const mockSamsungTvDriver = createSimulatedTvDriver({
  id: "mock-samsung-tv",
  displayName: "Samsung TV (Simulated)",
  capabilities: [
    "power",
    "volumeUp",
    "volumeDown",
    "setVolume",
    "mute",
    "channelUp",
    "channelDown",
    "inputSelection",
    "directionalNavigation",
    "select",
    "back",
    "home",
    "menu",
  ],
  simulatedLatencyMs: 140,
});
