import { activeBackend } from "./keyValueBackend";

// Web/demo stand-in for @react-native-async-storage/async-storage so demo mode can run against memory.

const AsyncStorageStandIn = {
  async getItem(key: string): Promise<string | null> {
    return activeBackend().get(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    activeBackend().set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    activeBackend().remove(key);
  },
};

export default AsyncStorageStandIn;
