import { createNavigationContainerRef } from "@react-navigation/native";

const DEVICES_TAB_NAME = "Devices";

/** Ref handed to the NavigationContainer so code outside a screen (deep links) can switch tabs. */
export const appNavigationRef = createNavigationContainerRef();

/** Switches to the Devices tab when navigation is ready; a no-op before then (the tab is the first one anyway). */
export function navigateToDevicesTab(): void {
  if (appNavigationRef.isReady()) appNavigationRef.navigate(DEVICES_TAB_NAME as never);
}
