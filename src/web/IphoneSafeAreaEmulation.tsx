import { ReactNode } from "react";
import { Platform } from "react-native";
import { SafeAreaFrameContext, SafeAreaInsetsContext } from "react-native-safe-area-context";
import { IPHONE_17_METRICS } from "./iphoneSafeAreaMetrics";

/** On web only, overrides the measured (always zero) safe-area insets with an iPhone 17's so paddings match the phone; a no-op on iOS and Android. */
export function IphoneSafeAreaEmulation({ children }: { children: ReactNode }) {
  if (Platform.OS !== "web") return <>{children}</>;
  return (
    <SafeAreaFrameContext.Provider value={IPHONE_17_METRICS.frame}>
      <SafeAreaInsetsContext.Provider value={IPHONE_17_METRICS.insets}>{children}</SafeAreaInsetsContext.Provider>
    </SafeAreaFrameContext.Provider>
  );
}
