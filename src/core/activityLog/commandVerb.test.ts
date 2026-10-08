import { describeCommandVerb, isWorthLogging } from "./commandVerb";

describe("describeCommandVerb", () => {
  test("power off reads as 'turned off'", () => {
    expect(describeCommandVerb({ deviceId: "d", capability: "powerOff" })).toBe("turned off");
  });

  test("launching a known streaming service names it", () => {
    expect(describeCommandVerb({ deviceId: "d", capability: "launchApp", args: { service: "netflix" } })).toBe("launched Netflix on");
    expect(describeCommandVerb({ deviceId: "d", capability: "launchApp", args: { service: "primeVideo" } })).toBe("launched Prime Video on");
  });

  test("launching by raw app id never puts the id in the log", () => {
    expect(describeCommandVerb({ deviceId: "d", capability: "launchApp", args: { appId: "com.secret.app" } })).toBe("launched an app on");
    expect(describeCommandVerb({ deviceId: "d", capability: "launchApp", args: { service: "not-a-service" } })).toBe("launched an app on");
  });

  test("text entry logs only that text was typed, never the text", () => {
    const verb = describeCommandVerb({ deviceId: "d", capability: "textEntry", args: { text: "hunter2-password" } });
    expect(verb).toBe("typed text on");
    expect(verb).not.toContain("hunter2");
  });

  test("volume commands never include the target level or other args", () => {
    expect(describeCommandVerb({ deviceId: "d", capability: "setVolume", args: { volume: 33 } })).toBe("set the volume on");
  });

  test("an unknown capability falls back to a generic phrase", () => {
    expect(describeCommandVerb({ deviceId: "d", capability: "somethingNew" as never })).toBe("sent a command to");
  });

  test("pointer movement never includes the dx/dy args in the log", () => {
    expect(describeCommandVerb({ deviceId: "d", capability: "pointerMove", args: { dx: 12, dy: -4 } })).toBe("moved the pointer on");
  });
});

describe("isWorthLogging", () => {
  test("successful navigation presses are skipped as noise", () => {
    expect(isWorthLogging("directionalNavigation", true)).toBe(false);
    expect(isWorthLogging("select", true)).toBe(false);
    expect(isWorthLogging("selectPlayPause", true)).toBe(false);
  });

  // ADR-HEARTH-215: a single touchpad drag fires pointerMove dozens of times -- same noise class as directionalNavigation above.
  test("successful pointer movement and clicks are skipped as noise too, same as directionalNavigation", () => {
    expect(isWorthLogging("pointerMove", true)).toBe(false);
    expect(isWorthLogging("pointerClick", true)).toBe(false);
  });

  test("a failed navigation press is still logged", () => {
    expect(isWorthLogging("directionalNavigation", false)).toBe(true);
  });

  test("meaningful commands are logged whether they work or not", () => {
    expect(isWorthLogging("powerOff", true)).toBe(true);
    expect(isWorthLogging("volumeUp", true)).toBe(true);
  });
});
