const UNSUPPORTED_MESSAGE = "This React Native/Expo module has no headless equivalent and must not be reached from the runner.";

/** Proxy that lets an unreachable RN-only import load but throws the moment anything is actually used. */
const unsupportedModule: unknown = new Proxy(
  {},
  {
    get: (_target, property) => {
      if (property === "__esModule") return false;
      throw new Error(`${UNSUPPORTED_MESSAGE} (accessed "${String(property)}")`);
    },
  }
);

export default unsupportedModule;
