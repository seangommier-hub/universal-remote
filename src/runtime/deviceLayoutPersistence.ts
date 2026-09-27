import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceLayout, emptyLayout, normalizeLayout } from "../core/layout/deviceLayout";
import { logger } from "../core/logging/logger";

const LOG_SCOPE = "deviceLayoutPersistence";
const LAYOUT_KEY = "hearth.deviceLayout.v1";

/** Loads this phone's saved rooms, favorites and order; a missing or damaged value gives an empty layout. */
export async function loadDeviceLayout(): Promise<DeviceLayout> {
  try {
    const raw = await AsyncStorage.getItem(LAYOUT_KEY);
    return raw ? normalizeLayout(JSON.parse(raw)) : emptyLayout();
  } catch (error) {
    logger.warn(LOG_SCOPE, "could not read saved device layout, starting empty", { error: String(error) });
    return emptyLayout();
  }
}

/** Saves the whole layout in one write. */
export async function saveDeviceLayout(layout: DeviceLayout): Promise<void> {
  await AsyncStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}
