import { useNavigation } from "@react-navigation/native";
import { useEffect } from "react";
import { newDevicesTabLabel } from "../discovery/newDeviceAlert";
import { theme } from "./theme";

/** ADR-HEARTH-222: shows the new-device count as a badge on this screen's own bottom tab, and says it aloud for screen readers. */
export function useDevicesTabBadge(count: number): void {
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({
      tabBarBadge: count > 0 ? count : undefined,
      // The accent colour, not the default alarm red: this is a calm "something to look at", not an error.
      tabBarBadgeStyle: { backgroundColor: theme.accentEnd, color: theme.background },
      tabBarAccessibilityLabel: newDevicesTabLabel(count),
    });
  }, [navigation, count]);
}
