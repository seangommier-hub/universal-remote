// Global test mocks for native modules that don't resolve in the plain Jest/Node environment
// (no React Native bridge). Applied to every test file so individual test files touching
// AsyncStorage/SecureStore only indirectly (e.g. via the relay fallback's import chain) don't
// each need to repeat the same two jest.mock() calls.
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// jest-expo's own auto-generated mock (expo-crypto/mocks/ExpoCrypto.ts) returns `undefined` from
// randomUUID() — fine for modules that don't care about the value, but SwitchBotClient.ts's real
// per-request nonce needs an actual varying UUID-shaped string to test meaningfully. Node's own
// `crypto.randomUUID()` (stable since Node 15.6/16.7) gives real, unique UUIDv4 strings without
// pulling in another dependency just for tests.
jest.mock("expo-crypto", () => ({
  randomUUID: () => require("crypto").randomUUID(),
}));
