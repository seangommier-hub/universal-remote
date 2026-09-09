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
