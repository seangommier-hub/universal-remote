import { StyleSheet, View } from "react-native";
import { StreamingService } from "../core/types/Capability";
import { remoteCardStyles } from "./remoteCardStyles";
import { STREAMING_APPS, StreamingAppTile } from "./StreamingAppTile";
import { useRemoteScaled } from "./RemoteScaleContext";
import { theme } from "./theme";

interface StreamingAppsRowProps {
  onLaunch: (service: StreamingService) => void;
  disabled: boolean;
}

/**
 * Real-hardware research (2026-09-10): Roku (POST /launch/<channel id>) and LG
 * (ssap://system.launcher/launch) both have real, verified app-launch mechanisms — see
 * Capability.ts and each driver's own id mapping. Samsung/Sony don't declare "launchApp"
 * because neither has a confirmed equivalent, not because this row forgot them.
 */
export function StreamingAppsRow({ onLaunch, disabled }: StreamingAppsRowProps) {
  const { size } = useRemoteScaled();
  return (
    <View style={[remoteCardStyles.card, remoteCardStyles.compactCard, { padding: size(theme.spacing.sm), borderRadius: size(theme.radius.lg) }]}>
      <View style={styles.streamingRow}>
        {STREAMING_APPS.map((app) => (
          <StreamingAppTile
            key={app.service}
            label={app.label}
            bg={app.bg}
            fg={app.fg}
            fontScale={app.fontScale}
            onPress={() => onLaunch(app.service)}
            disabled={disabled}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Real-device finding (2026-09-10): "boxes are not the same size" — flexBasis+flexGrow with
  // flexWrap meant that if the wordmark text in any one tile (e.g. "prime video") needed more
  // than its equal share of the row, React Native's default flexShrink:0 refused to shrink it,
  // which could push the 4th tile onto its own wrapped row — where flexGrow:1 with no siblings
  // stretches it to the FULL row width, becoming a completely different size/shape than the other
  // three. Fixed width, no flexGrow, no flexWrap: exactly four tiles always render (STREAMING_APPS
  // is a fixed 4-entry list), and the arithmetic (4 × 22% + 3 gaps of spacing.sm) fits with real
  // margin on a 375pt screen — verified by calculation, not assumed, same discipline as the hub
  // row's own overflow fix (ADR-HEARTH-016).
  // Real-device finding (2026-09-10): "things need to be spread out and spaced properly" —
  // a fixed spacing.sm (8px) gap between four fixed-22%-width tiles left ~12% of the row's
  // width unused on the right, so the tiles read as clustered to the left rather than filling
  // the card. justifyContent:"space-between" distributes that leftover width as the gap
  // between tiles instead of leaving it stranded — doesn't touch each tile's own width/sizing
  // (still fixed %, no flexGrow, no flexWrap), so the "boxes not the same size" bug the comment
  // below describes can't recur; that bug was specifically about flexGrow+flexWrap sizing, not
  // about how the parent row distributes its own free space.
  streamingRow: { flexDirection: "row", justifyContent: "space-between" },
});
