import { logger } from "../core/logging/logger";
import { ScreenErrorBoundary } from "./ScreenErrorBoundary";

// This repo has no React Native component-test renderer (ADR-HEARTH-196), so the boundary's two
// lifecycle hooks are exercised directly: they are the whole of what makes it contain an error.
jest.mock("./CapabilityButton", () => ({ CapabilityButton: () => null }));

describe("ScreenErrorBoundary", () => {
  test("a render error switches the screen to its fallback", () => {
    expect(ScreenErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true });
  });

  test("the error is logged at error level with the screen name and component stack, so it ships to the Pi", () => {
    const errorSpy = jest.spyOn(logger, "error").mockImplementation(() => undefined);
    const boundary = new ScreenErrorBoundary({ screenName: "Settings", onBack: jest.fn(), children: null });
    boundary.componentDidCatch(new Error("boom"), { componentStack: "\n    in KidModeSettingsPanel" });
    expect(errorSpy).toHaveBeenCalledWith("ScreenErrorBoundary", "Settings failed to render", {
      message: "boom",
      componentStack: "\n    in KidModeSettingsPanel",
    });
  });
});
