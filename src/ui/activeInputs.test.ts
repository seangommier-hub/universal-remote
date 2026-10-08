import { activeInputs } from "./activeInputs";

const inputs = [
  { id: "HDMI_1", label: "Apple TV", connected: true },
  { id: "HDMI_2", label: "PS5", connected: false },
  { id: "HDMI_3", label: "Cable Box" },
  { id: "HDMI_4", label: "Switch", connected: false },
];

describe("activeInputs", () => {
  test("hides inputs the TV reports as not connected", () => {
    expect(activeInputs(inputs, undefined).map((i) => i.id)).toEqual(["HDMI_1", "HDMI_3"]);
  });

  test("keeps inputs the driver can't report on (no connected field)", () => {
    expect(activeInputs([{ id: "a", label: "A" }], undefined)).toHaveLength(1);
  });

  test("keeps the currently selected input even if it reads as unplugged", () => {
    expect(activeInputs(inputs, "HDMI_2").map((i) => i.id)).toEqual(["HDMI_1", "HDMI_2", "HDMI_3"]);
  });

  test("falls back to the full list rather than an empty card when nothing is active", () => {
    const allOff = [{ id: "x", label: "X", connected: false }, { id: "y", label: "Y", connected: false }];
    expect(activeInputs(allOff, undefined)).toEqual(allOff);
  });
});
