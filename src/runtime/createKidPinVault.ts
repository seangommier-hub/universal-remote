import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { loadFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import { KidPinVault } from "./kidPinVault";

// ADR-HEARTH-176: the production vault: hash with SHA-256, keep the records in the OS secure store.
// SecureStore keys may only use letters, digits, ".", "-" and "_", which the vault's keys already do.

/** Builds the vault used by the app. */
export function createKidPinVault(): KidPinVault {
  return new KidPinVault({
    storage: {
      get: (key) => SecureStore.getItemAsync(key),
      set: (key, value) => SecureStore.setItemAsync(key, value),
      remove: (key) => SecureStore.deleteItemAsync(key),
    },
    digest: (text) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text),
    newSalt: () => Crypto.randomUUID(),
    now: Date.now,
    getHouseholdToken: async () => (await loadFamilyCommandCenterConfig())?.token ?? null,
  });
}
