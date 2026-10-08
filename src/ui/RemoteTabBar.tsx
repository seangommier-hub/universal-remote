import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRemoteScaled } from "./RemoteScaleContext";
import { theme } from "./theme";

export type RemoteTab = "remote" | "keypad" | "keyboard";

interface RemoteTabBarProps {
  hasKeypad: boolean;
  hasKeyboard: boolean;
  activeTab: RemoteTab;
  channelInput: string;
  onSelectTab: (tab: RemoteTab) => void;
}

/**
 * Sean: "it shouldn't require scrolling." A device with every section active (LG: power,
 * volume/channel, keypad, d-pad, back/home/menu) genuinely doesn't fit one screen — the
 * 4-row numeric keypad alone is the single biggest contributor. Splitting it into its own tab
 * is the one change that actually buys back a screen's worth of height, rather than
 * incrementally shrinking padding everywhere. Only shown when there's something to split
 * (hasKeypad/hasKeyboard). Same reasoning covers the Keyboard tab (2026-09-16).
 *
 * ADR-HEARTH-180: accessibilityRole="tab" + accessibilityState={{selected}} on each — without
 * these a screen reader only ever hears "Remote", "Keypad", "Keyboard" as plain buttons, with
 * no way to tell which one is currently showing.
 */
export function RemoteTabBar({ hasKeypad, hasKeyboard, activeTab, channelInput, onSelectTab }: RemoteTabBarProps) {
  const { size, font } = useRemoteScaled();
  const barSizing = { borderRadius: size(theme.radius.md), padding: size(theme.spacing.xs), gap: size(theme.spacing.xs) };
  const tabSizing = { paddingVertical: size(theme.spacing.sm), borderRadius: size(theme.radius.sm) };
  const tabText = { fontSize: font(theme.type.label) };
  return (
    <View style={[styles.tabBar, barSizing]} accessibilityRole="tablist">
      <Pressable
        style={[styles.tab, tabSizing, activeTab === "remote" && styles.tabActive]}
        onPress={() => onSelectTab("remote")}
        accessibilityRole="tab"
        accessibilityLabel="Remote"
        accessibilityState={{ selected: activeTab === "remote" }}
      >
        <Text style={[styles.tabLabel, tabText, activeTab === "remote" && styles.tabLabelActive]}>Remote</Text>
      </Pressable>
      {hasKeypad && (
        <Pressable
          style={[styles.tab, tabSizing, activeTab === "keypad" && styles.tabActive]}
          onPress={() => onSelectTab("keypad")}
          accessibilityRole="tab"
          accessibilityLabel={channelInput.length > 0 ? `Keypad, entered ${channelInput}` : "Keypad"}
          accessibilityState={{ selected: activeTab === "keypad" }}
        >
          <Text style={[styles.tabLabel, tabText, activeTab === "keypad" && styles.tabLabelActive]}>
            Keypad{channelInput.length > 0 ? ` (${channelInput})` : ""}
          </Text>
        </Pressable>
      )}
      {hasKeyboard && (
        <Pressable
          style={[styles.tab, tabSizing, activeTab === "keyboard" && styles.tabActive]}
          onPress={() => onSelectTab("keyboard")}
          accessibilityRole="tab"
          accessibilityLabel="Keyboard"
          accessibilityState={{ selected: activeTab === "keyboard" }}
        >
          <Text style={[styles.tabLabel, tabText, activeTab === "keyboard" && styles.tabLabelActive]}>Keyboard</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  tab: { flex: 1, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.sm, alignItems: "center" },
  tabActive: { backgroundColor: theme.accentEnd },
  tabLabel: { color: theme.textSecondary, fontSize: theme.type.label, fontWeight: "700" },
  tabLabelActive: { color: theme.background },
});
