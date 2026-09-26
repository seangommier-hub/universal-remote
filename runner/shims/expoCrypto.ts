import { randomUUID as nodeRandomUUID } from "node:crypto";

/** Node stand-in for expo-crypto's randomUUID (the only expo-crypto call the drivers make). */
export function randomUUID(): string {
  return nodeRandomUUID();
}
