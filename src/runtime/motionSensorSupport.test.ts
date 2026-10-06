import { binaryHasMotionSensor } from "./motionSensorSupport";

describe("binaryHasMotionSensor", () => {
  test("the 1.1.0 binary has no motion sensor module, so it is never looked up there", () => {
    expect(binaryHasMotionSensor("1.1.0")).toBe(false);
  });

  test("the 1.2.0 binary (built with expo-sensors) keeps motion bump", () => {
    expect(binaryHasMotionSensor("1.2.0")).toBe(true);
  });

  test("an unknown runtime (Expo Go, web, a dev build) is not blocked", () => {
    expect(binaryHasMotionSensor(null)).toBe(true);
    expect(binaryHasMotionSensor(undefined)).toBe(true);
  });
});
