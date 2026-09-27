import { CapabilityId } from "../types/Capability";
import { Device } from "../types/Device";
import { confirmationFor, needsConfirmation } from "./commandConfirmation";

function device(name: string, config: Record<string, unknown> = {}): Device {
  return { id: "d", name, category: "cover", manufacturer: "Home Assistant", driverId: "home-assistant", capabilities: [], config };
}

describe("needsConfirmation", () => {
  test.each<[CapabilityId]>([["lock"], ["unlock"]])("%s always asks", (capability) => {
    expect(needsConfirmation(device("Front Door"), capability, {})).toBe(true);
  });

  test.each(["garage", "gate", "door"])("moving a %s cover asks, whether the class is saved or live", (deviceClass) => {
    expect(needsConfirmation(device("Cover", { deviceClass }), "open", {})).toBe(true);
    expect(needsConfirmation(device("Cover"), "close", { deviceClass })).toBe(true);
    expect(needsConfirmation(device("Cover", { deviceClass }), "setPosition", {})).toBe(true);
  });

  test("a blind, a stop press and other capabilities do not ask", () => {
    expect(needsConfirmation(device("Blind", { deviceClass: "blind" }), "open", {})).toBe(false);
    expect(needsConfirmation(device("Garage", { deviceClass: "garage" }), "stop", {})).toBe(false);
    expect(needsConfirmation(device("Lamp"), "power", {})).toBe(false);
  });

  test.each<[CapabilityId]>([["armHome"], ["armAway"], ["armNight"], ["disarm"]])("%s always asks (ADR-HEARTH-182)", (capability) => {
    expect(needsConfirmation(device("Home Alarm"), capability, {})).toBe(true);
  });
});

describe("confirmationFor", () => {
  test("names the device and the action on the confirm button", () => {
    expect(confirmationFor(device("Front Door"), "unlock", {})).toMatchObject({ title: "Unlock Front Door?", confirmLabel: "Unlock" });
    expect(confirmationFor(device("Lamp"), "power", {})).toBeNull();
  });

  test("an alarm press names the security system, not the door (ADR-HEARTH-182)", () => {
    expect(confirmationFor(device("Home Alarm"), "disarm", {})).toMatchObject({ title: "Disarm Home Alarm?", confirmLabel: "Disarm", message: expect.stringMatching(/security system/) });
  });
});
