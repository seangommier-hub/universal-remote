import { Pressable, StyleSheet, Text } from "react-native";
import { StreamingService } from "../core/types/Capability";
import { fireHapticClick } from "./CapabilityButton";
import { useRemoteScaled } from "./RemoteScaleContext";
import { theme } from "./theme";

// ADR-HEARTH-219: base tile height at scale 1 -- 22% of the 375pt baseline row (73.7px) / the old 1.6
// aspect ratio. An explicit, scaled height replaces aspectRatio so the tile follows the remote's
// total scale instead of whatever width a given phone happens to give it (very tall at iPhone SE).
const TILE_BASE_HEIGHT = 46;

// Real brand identity colors (public, not the trademarked logo artwork itself) — sourced 2026-09-10
// from each service's actual wordmark/background. No bundled logo image assets exist in this app,
// so a colored tile with a styled wordmark is the honest stand-in: recognizable, not a copy of the
// real mark. YouTube previously used Ionicons' own "logo-youtube" glyph — dropped 2026-09-10 after
// two rounds of layout fixes still left it reported as "not middle aligned": an icon-font glyph's
// visual mark isn't always centered within its own em-square the way a container's flex-centering
// assumes, and no amount of wrapper/box fixing can correct that from outside the font. A text
// wordmark, like the other three tiles already use and have now had their alignment confirmed
// fixed, is the more reliable choice — one rendering mechanism for all four tiles, not two.
// Real-device ask (2026-09-10): "adjust the size of the hulu button to match" — all four tiles
// are already the exact same box size (styles.streamingTile, same width/aspectRatio for all),
// so this was never about the box; it's the wordmark itself. Hulu's real logotype is short and
// entirely lowercase (no tall ascenders like "l" aside, no caps), which reads visually smaller
// than "NETFLIX"/"YouTube" at the identical declared font size — a real typographic effect
// (x-height vs. cap-height), not a sizing bug in the layout. `fontScale` (default 1, so every
// other tile renders exactly as before) lets one wordmark compensate without touching the shared
// box/tile styling every entry uses.
export const STREAMING_APPS: { service: StreamingService; label: string; bg: string; fg: string; fontScale?: number }[] = [
  { service: "netflix", label: "NETFLIX", bg: "#141414", fg: "#E50914" },
  { service: "hulu", label: "hulu", bg: "#1CE783", fg: "#0B0B0B", fontScale: 1.35 },
  // fontScale 0.7 (visual sweep, 2026-10-06): "prime video" (11 characters, the longest of the
  // four wordmarks) only fit this tile's ~60px text area through `adjustsFontSizeToFit` shrinking
  // down to its own `minimumFontScale` floor of 0.7 below -- an iOS-only API (see this file's own
  // "not centered" comment above) that never shrinks anything on web/Android, where it rendered as
  // a bare, numberOfLines-truncated "prime vi...", the one visibly broken tile beside three full
  // wordmarks. Declaring the same 0.7 scale as this tile's actual base size (same mechanism Hulu's
  // 1.35 already uses) makes every platform render what iOS was already settling on, instead of
  // only iOS.
  { service: "primeVideo", label: "prime video", bg: "#0F171E", fg: "#00A8E1", fontScale: 0.7 },
  { service: "youtube", label: "YouTube", bg: "#141414", fg: "#FF0000" },
];

/** One branded streaming-app tile in the remote screen's Netflix/Hulu/Prime/YouTube launch row. */
export function StreamingAppTile({
  label,
  bg,
  fg,
  fontScale = 1,
  onPress,
  disabled,
}: {
  label: string;
  bg: string;
  fg: string;
  fontScale?: number;
  onPress: () => void;
  disabled: boolean;
}) {
  const { size, font } = useRemoteScaled();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={disabled ? undefined : fireHapticClick}
      disabled={disabled}
      style={[styles.streamingTile, { backgroundColor: bg, height: size(TILE_BASE_HEIGHT), borderRadius: size(theme.radius.md) }, disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${label.trim()}`}
    >
      {/* Real-device finding (2026-09-10): "the other logos are not centered" too, not just
          YouTube's — "prime video" (11 characters) almost certainly wraps to two lines at this
          tile's width, and a fixed-aspectRatio box doesn't grow to fit that second line, so
          centered-but-overflowing text reads as visibly off-center. numberOfLines +
          adjustsFontSizeToFit forces every wordmark onto one line, shrinking down rather than
          wrapping, so centering is guaranteed the same way for all four tiles now that they all
          go through this one rendering path. */}
      <Text
        style={[styles.streamingTileWordmark, { color: fg, fontSize: font(theme.type.label) * fontScale }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  streamingTile: {
    width: "22%",
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xs,
  },
  streamingTileWordmark: { fontSize: theme.type.label, fontWeight: "700", letterSpacing: 0.3, textAlign: "center" },
  disabled: { opacity: 0.35 },
});
