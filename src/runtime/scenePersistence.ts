import AsyncStorage from "@react-native-async-storage/async-storage";
import { Scene } from "../core/types/Scene";

const SCENES_STORAGE_KEY = "hearth.scenes";

/** No SecureStore split needed here (unlike persistence.ts's device config) — a Scene only ever references a deviceId + capability, never a credential. */
export async function loadScenes(): Promise<Scene[]> {
  const raw = await AsyncStorage.getItem(SCENES_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Scene[];
  } catch {
    return [];
  }
}

export async function saveScene(scene: Scene): Promise<void> {
  const existing = await loadScenes();
  const next = [...existing.filter((s) => s.id !== scene.id), scene];
  await AsyncStorage.setItem(SCENES_STORAGE_KEY, JSON.stringify(next));
}

export async function removeScene(sceneId: string): Promise<void> {
  const existing = await loadScenes();
  await AsyncStorage.setItem(SCENES_STORAGE_KEY, JSON.stringify(existing.filter((s) => s.id !== sceneId)));
}
