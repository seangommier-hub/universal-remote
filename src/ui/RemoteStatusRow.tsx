import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { useRemoteScaled } from "./RemoteScaleContext";
import { theme } from "./theme";

const PILL_ICON_SIZE = 14;
const STATUS_DOT_SIZE = 7;

interface RemoteStatusRowProps {
  statusLine: string;
  isConnected: boolean;
  /** "on"/"off" when known, undefined when genuinely unknown (see UniversalTvRemote.tsx's own knownPower comment). */
  knownPower: "on" | "off" | undefined;
  volume: number | undefined;
  muted: boolean;
  knownMuted: boolean | undefined;
  channel: number | undefined;
  input: string | undefined;
}

/** ADR-HEARTH-163: the remote screen's connection pill (plain-language status line) plus any known power/volume/channel/input pills next to it. */
export function RemoteStatusRow({ statusLine, isConnected, knownPower, volume, muted, knownMuted, channel, input }: RemoteStatusRowProps) {
  const { size, font } = useRemoteScaled();
  const pillSizing = { gap: size(theme.spacing.xs), paddingVertical: size(theme.spacing.xs), paddingHorizontal: size(theme.spacing.md) };
  const pillText = { fontSize: font(theme.type.caption) };
  const iconSize = size(PILL_ICON_SIZE);
  return (
    <View style={[styles.statusRow, { gap: size(theme.spacing.sm) }]}>
      <View
        style={[styles.statusPill, pillSizing, styles.statusPillShrink, isConnected ? styles.statusPillOn : styles.statusPillOff]}
        accessibilityLiveRegion="polite"
        accessible
        accessibilityLabel={statusLine}
      >
        <View style={[styles.statusDot, { width: size(STATUS_DOT_SIZE), height: size(STATUS_DOT_SIZE), backgroundColor: isConnected ? theme.statusOn : theme.statusOff }]} />
        <Text style={[styles.statusPillText, pillText]} numberOfLines={1}>
          {statusLine}
        </Text>
      </View>
      {knownPower !== undefined && (
        <View style={[styles.statusPill, pillSizing]}>
          <Ionicons name={knownPower === "on" ? "power" : "power-outline"} size={iconSize} color={theme.textSecondary} />
          <Text style={[styles.statusPillText, pillText]}>{knownPower === "on" ? "On" : "Off"}</Text>
        </View>
      )}
      {volume !== undefined && (
        <View style={[styles.statusPill, pillSizing]}>
          <Ionicons name={muted ? "volume-mute-outline" : "volume-medium-outline"} size={iconSize} color={theme.textSecondary} />
          <Text style={[styles.statusPillText, pillText]}>{volume}</Text>
        </View>
      )}
      {volume === undefined && knownMuted !== undefined && (
        <View style={[styles.statusPill, pillSizing]}>
          <Ionicons name={knownMuted ? "volume-mute-outline" : "volume-medium-outline"} size={iconSize} color={theme.textSecondary} />
          <Text style={[styles.statusPillText, pillText]}>{knownMuted ? "Muted" : "Unmuted"}</Text>
        </View>
      )}
      {channel !== undefined && (
        <View style={[styles.statusPill, pillSizing]}>
          <Text style={[styles.statusPillText, pillText]}>Ch {channel}</Text>
        </View>
      )}
      {input !== undefined && (
        <View style={[styles.statusPill, pillSizing]}>
          <Text style={[styles.statusPillText, pillText]}>{input}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    backgroundColor: theme.surfaceRaised,
    borderRadius: theme.radius.full,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  statusPillShrink: { flexShrink: 1 },
  statusPillOn: { backgroundColor: theme.statusOnSoft },
  statusPillOff: { backgroundColor: theme.surfaceRaised },
  statusDot: { width: 7, height: 7, borderRadius: theme.radius.full },
  statusPillText: { color: theme.textSecondary, fontSize: theme.type.caption, fontWeight: "600" },
});
