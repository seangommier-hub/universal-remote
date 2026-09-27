import { AlexaPlug } from "../drivers/outlet/alexa/AlexaPlugClient";

// ADR-HEARTH-192: demo fixture for "Sync from Alexa" (?demo=1&screen=add:alexa) — deliberately
// includes one plug of each real state the bridge's own contract can report, so the picker's
// on/off/unreachable/unknown-state rendering can be checked without a real Amazon-linked plug.
const DEMO_ALEXA_PLUGS: AlexaPlug[] = [
  { id: "demo-alexa-lamp", name: "Living Room Lamp", manufacturer: "Amazon", on: true, reachable: true },
  { id: "demo-alexa-heater", name: "Garage Heater", manufacturer: "Amazon", on: false, reachable: false },
  { id: "demo-alexa-fan", name: "Office Fan", manufacturer: "Amazon", on: null, reachable: true },
];

/** The `{"plugs": [...]}` body `GET /api/integrations/hearth/alexa/plugs` returns in demo mode. */
export function demoAlexaPlugsBody(): { plugs: AlexaPlug[] } {
  return { plugs: DEMO_ALEXA_PLUGS };
}
