import { describeAlexaBridgeFailure } from "./describeAlexaBridgeFailure";
import { AlexaBridgeError } from "./AlexaPlugClient";

describe("describeAlexaBridgeFailure", () => {
  test("surfaces the bridge's 'Amazon isn't signed in' 502 message verbatim, not a generic network-blip framing", () => {
    const error = new AlexaBridgeError("Amazon isn't signed in yet on Family Command Center — finish the one-time sign-in there first.", 502);

    const result = describeAlexaBridgeFailure("Alexa", error);

    expect(result.message).toBe("Amazon isn't signed in yet on Family Command Center — finish the one-time sign-in there first.");
  });

  test("surfaces the bridge's 'bridge is down' 502 message verbatim -- a distinct message from the sign-in case, both handled the same way", () => {
    const error = new AlexaBridgeError("The Alexa bridge isn't running on Family Command Center right now.", 502);

    const result = describeAlexaBridgeFailure("Alexa", error);

    expect(result.message).toBe("The Alexa bridge isn't running on Family Command Center right now.");
  });

  test("falls back to the generic pairing-failure copy (a different title) for a non-502 error, even a plain Error named 'AlexaBridgeError'-like message", () => {
    const result = describeAlexaBridgeFailure("Alexa", new AlexaBridgeError("Family Command Center returned 400", 400));

    expect(result.title).not.toBe("Amazon isn't linked yet");
  });
});
