import { StyleSheet, Text, View } from "react-native";
import { CapabilityId } from "../core/types/Capability";
import { Device } from "../core/types/Device";
import { CapabilityButton } from "./CapabilityButton";
import { DPAD_HEIGHT, ROCKER_WIDTH } from "./dpadLayout";
import { has } from "./hasCapability";
import { remoteCardStyles } from "./remoteCardStyles";
import { theme } from "./theme";
import { useDpadSwipeGesture } from "./useDpadSwipeGesture";
import { useHoldRepeat } from "./useHoldRepeat";

interface DpadClusterProps {
  device: Device;
  scale: number;
  scaledDpadSize: number;
  scaledSmDiameter: number;
  /** ADR-HEARTH-216: the live overflow-correction factor (useRemoteFitScale) -- applied here only
   * to this card's own vertical padding/margin, never to a tap target (those are already covered
   * by `scale`, which the caller has combined with this same factor for the circles above). */
  fitScale: number;
  disabled: boolean;
  playbackState: unknown;
  seekMultiplier: number | null;
  dpadSwipeHandlers: ReturnType<typeof useDpadSwipeGesture>;
  onSend: (capability: CapabilityId, args?: Record<string, unknown>) => void;
  onSeekDirection: (direction: "left" | "right") => void;
  onCenterSelect: () => void;
  onHoldCenterPlayPause: () => void;
}

/**
 * Sean's reference (2026-09-10): volume and channel rockers sit directly beside the d-pad
 * as one control cluster — "everything in one place" — rather than as a separate card
 * stacked above it. (A soft ambient glow behind the cluster was tried and removed
 * 2026-09-10 — real-device feedback: "why the random orange circle" — a flat-color View
 * has no blur in React Native, so a decorative wash just reads as a hard-edged circle.)
 * Only rendered for a device with directionalNavigation — see VolumeChannelCard.tsx for the
 * fallback used by a device (Sony) with volume/channel but no d-pad to anchor to.
 */
export function DpadCluster({
  device,
  scale,
  scaledDpadSize,
  scaledSmDiameter,
  fitScale,
  disabled,
  playbackState,
  seekMultiplier,
  dpadSwipeHandlers,
  onSend,
  onSeekDirection,
  onCenterSelect,
  onHoldCenterPlayPause,
}: DpadClusterProps) {
  // ADR-HEARTH-211: press-and-hold repeats the direction, like a real remote's d-pad, instead of
  // needing rapid manual taps to move continuously (which raced LG's pointer-socket setup). Hooks
  // called unconditionally regardless of which buttons the device's capabilities actually render.
  const upHold = useHoldRepeat(() => onSend("directionalNavigation", { direction: "up" }));
  const downHold = useHoldRepeat(() => onSend("directionalNavigation", { direction: "down" }));
  // left/right: the genuine first press still goes through onSeekDirection exactly as before (real
  // command + tap-streak registration for the seek-multiplier badge, ADR-HEARTH-204) -- only a
  // held repeat past the initial delay falls back to the plain command, deliberately bypassing the
  // streak tracker so a hold can never drive the multiplier the way ADR-HEARTH-204 says it
  // shouldn't ("the increase in speed should be due to multiple taps," not a hold timer).
  const leftHold = useHoldRepeat(
    () => onSend("directionalNavigation", { direction: "left" }),
    () => onSeekDirection("left")
  );
  const rightHold = useHoldRepeat(
    () => onSend("directionalNavigation", { direction: "right" }),
    () => onSeekDirection("right")
  );
  return (
    <View style={[styles.hubCard, { paddingVertical: theme.spacing.sm * fitScale }]}>
      {/* ADR-HEARTH-204: a fast same-direction d-pad left/right tap streak — purely an honest
          label for Hearth's own tap cadence, never a claim about what the TV/app itself is
          doing with it. position:"absolute" so it never adds height even while shown. */}
      {seekMultiplier !== null && (
        <View style={styles.seekMultiplierOverlay} pointerEvents="none">
          <View style={styles.seekMultiplierBadge}>
            <Text style={styles.seekMultiplierLabel}>{`Seeking ${seekMultiplier}x`}</Text>
          </View>
        </View>
      )}
      <View style={styles.hubRow}>
        {(has(device, "volumeUp") || has(device, "volumeDown")) && (
          <View style={[remoteCardStyles.rockerColumn, { height: scaledDpadSize, width: ROCKER_WIDTH * scale, borderRadius: (ROCKER_WIDTH * scale) / 2 }]}>
            {has(device, "volumeUp") && (
              <CapabilityButton
                shape="circle"
                scale={scale}
                icon="chevron-up"
                label="Vol +"
                onPress={() => onSend("volumeUp")}
                disabled={disabled}
                containerStyle={styles.dpadArrow}
              />
            )}
            <Text style={remoteCardStyles.rockerColumnLabel}>Vol</Text>
            {has(device, "volumeDown") && (
              <CapabilityButton
                shape="circle"
                scale={scale}
                icon="chevron-down"
                label="Vol -"
                onPress={() => onSend("volumeDown")}
                disabled={disabled}
                containerStyle={styles.dpadArrow}
              />
            )}
          </View>
        )}
        <View style={[styles.dpad, { width: scaledDpadSize, height: scaledDpadSize, borderRadius: scaledDpadSize / 2 }]} {...dpadSwipeHandlers}>
          <CapabilityButton
            shape="circle"
            scale={scale}
            icon="chevron-up"
            label="Up"
            onPress={() => {}}
            onPressIn={upHold.onPressIn}
            onPressOut={upHold.onPressOut}
            disabled={disabled}
            containerStyle={styles.dpadArrow}
          />
          <View style={styles.dpadMiddleRow}>
            <CapabilityButton
              shape="circle"
              scale={scale}
              icon="chevron-back"
              label="Left"
              onPress={() => {}}
              onPressIn={leftHold.onPressIn}
              onPressOut={leftHold.onPressOut}
              disabled={disabled}
              containerStyle={styles.dpadArrow}
            />
            {has(device, "selectPlayPause") ? (
              // Sean, directly (2026-09-20, ADR-HEARTH-114): his real LG remote's OK/wheel-
              // click button already does select, play, AND pause with one press — this is
              // still purely capability-gated (has(device, "selectPlayPause")), not brand logic;
              // it just happens that only LgWebOsDriver currently declares this capability, the
              // same way only Samsung currently declares "sleepTimer" above.
              <CapabilityButton
                shape="circle"
                scale={scale}
                size="lg"
                icon={playbackState === "playing" ? "pause" : playbackState === "paused" ? "play" : "checkmark"}
                label={playbackState === "playing" ? "Pause" : playbackState === "paused" ? "Play" : "Select"}
                variant="accent"
                onPress={onCenterSelect}
                onLongPress={has(device, "play") && has(device, "pause") ? onHoldCenterPlayPause : undefined}
                disabled={disabled}
              />
            ) : has(device, "select") ? (
              <CapabilityButton
                shape="circle"
                scale={scale}
                size="lg"
                icon="checkmark"
                label="Select"
                variant="accent"
                onPress={() => onSend("select")}
                disabled={disabled}
              />
            ) : (
              <View style={[styles.dpadCenterSpacer, { width: scaledSmDiameter, height: scaledSmDiameter }]} />
            )}
            <CapabilityButton
              shape="circle"
              scale={scale}
              icon="chevron-forward"
              label="Right"
              onPress={() => {}}
              onPressIn={rightHold.onPressIn}
              onPressOut={rightHold.onPressOut}
              disabled={disabled}
              containerStyle={styles.dpadArrow}
            />
          </View>
          <CapabilityButton
            shape="circle"
            scale={scale}
            icon="chevron-down"
            label="Down"
            onPress={() => {}}
            onPressIn={downHold.onPressIn}
            onPressOut={downHold.onPressOut}
            disabled={disabled}
            containerStyle={styles.dpadArrow}
          />
        </View>
        {(has(device, "channelUp") || has(device, "channelDown")) && (
          <View style={[remoteCardStyles.rockerColumn, { height: scaledDpadSize, width: ROCKER_WIDTH * scale, borderRadius: (ROCKER_WIDTH * scale) / 2 }]}>
            {has(device, "channelUp") && (
              <CapabilityButton
                shape="circle"
                scale={scale}
                icon="chevron-up"
                label="Ch +"
                onPress={() => onSend("channelUp")}
                disabled={disabled}
                containerStyle={styles.dpadArrow}
              />
            )}
            <Text style={remoteCardStyles.rockerColumnLabel}>Ch</Text>
            {has(device, "channelDown") && (
              <CapabilityButton
                shape="circle"
                scale={scale}
                icon="chevron-down"
                label="Ch -"
                onPress={() => onSend("channelDown")}
                disabled={disabled}
                containerStyle={styles.dpadArrow}
              />
            )}
          </View>
        )}
      </View>
      {/* ADR-HEARTH-068 (2026-09-15): always visible whenever the capability exists, never
          gated on playbackState — see UniversalTvRemote.tsx's own comment above its
          playbackState declaration for why hiding this behind a state guess broke on real
          hardware twice in opposite directions (Netflix's PIN lock, YouTube's Skip Ad).
          Icon/label reflect real known state when available; otherwise a neutral,
          non-committal label rather than asserting a guess. LG and Roku have both folded
          "playPause" into the merged "selectPlayPause" center d-pad button above
          (ADR-HEARTH-114, ADR-HEARTH-116), so this row no longer renders for either — it still
          applies to any other driver (e.g. Apple TV, Sonos) that declares "playPause" as its
          own separate capability. */}
      {has(device, "playPause") && (
        <View style={[styles.playPauseRow, { marginTop: theme.spacing.sm * fitScale }]}>
          <CapabilityButton
            shape="circle"
            scale={scale}
            size="lg"
            icon={playbackState === "playing" ? "pause" : "play"}
            label={playbackState === "playing" ? "Pause" : playbackState === "paused" ? "Play" : "Play/Pause"}
            variant="accent"
            onPress={() => onSend("playPause")}
            disabled={disabled}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hubCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.border,
    // Was spacing.xxl (32) — real-device ask (2026-09-10): "make it one page, no scrolling."
    // Matching the horizontal padding (spacing.sm) instead of the old, much larger vertical value
    // both reads as better-proportioned (the old 32px-top/bottom vs 8px-sides read lopsided) and
    // buys back real height toward fitting one screen.
    paddingVertical: theme.spacing.sm,
    // Was spacing.lg (16) — part of the width-overflow fix above; every horizontal pixel here is
    // one the Vol/D-pad/Ch row doesn't have to spare on a 375pt-wide screen.
    paddingHorizontal: theme.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  // Was spacing.xl (24, two gaps = 48px) — the other half of the width-overflow fix above. At
  // spacing.sm the rocker/d-pad/rocker cluster is 316px, fitting a 375pt screen with ~11px to
  // spare; tighter gaps also read more like one cluster, not three separate groups near each other.
  hubRow: { flexDirection: "row", gap: theme.spacing.sm, alignItems: "center", justifyContent: "center" },
  // ADR-HEARTH-204: position:"absolute" (zero layout height, satisfying "no new scroll/height")
  // overlaid near the top of hubCard — hubCard's own overflow:"hidden" clips it if pushed further
  // up, so this sits inside its bounds rather than floating above the card.
  seekMultiplierOverlay: { position: "absolute", top: theme.spacing.xs, left: 0, right: 0, alignItems: "center", zIndex: 1 },
  seekMultiplierBadge: {
    backgroundColor: theme.surfaceOverlay,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  seekMultiplierLabel: { color: theme.textPrimary, fontSize: theme.type.caption, fontWeight: "700" },
  // ADR-HEARTH-068: kept tight (spacing.sm top margin, same button size as the d-pad's own
  // center button) rather than a full separate card — this hub is already fighting for vertical
  // space on a 375pt screen (see hubCard's own comment, "make it one page, no scrolling").
  playPauseRow: { marginTop: theme.spacing.sm, alignItems: "center", justifyContent: "center" },
  // Design pass (2026-09-10) on "the arrows on the front page" — four
  // individually-boxed circle buttons in a plus shape read as generic UI
  // chrome, indistinguishable from every other button on the screen, for
  // what's actually the most-used control in the whole app. A real remote's
  // d-pad is one physical wheel, not four separate switches. DPAD_HEIGHT
  // (196px) is exactly the width of the middle row too (sm+md+lg+md+sm =
  // 52+12+68+12+52 = 196) — not a coincidence, the existing rocker-column
  // alignment fix already made this container a perfect square — so giving
  // it that same fixed size + full border-radius turns it into a circular
  // disc the arrows sit ON, with each arrow's outer edge landing exactly
  // tangent to the disc's rim (verified by the same arithmetic: an arrow
  // centered 72px from the disc's center, with its own 26px radius, reaches
  // exactly 98px = the disc's own radius). The select button stays boxed
  // and accent-colored — the one control that should still stand out.
  dpad: {
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
    width: DPAD_HEIGHT,
    height: DPAD_HEIGHT,
    borderRadius: theme.radius.full,
    backgroundColor: theme.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.border,
  },
  dpadMiddleRow: { flexDirection: "row", gap: theme.spacing.md, alignItems: "center" },
  dpadCenterSpacer: { width: theme.circleDiameter.sm, height: theme.circleDiameter.sm },
  // Removes the individual button chrome (background+border) CapabilityButton
  // normally draws for shape="circle" — on the shared disc above, a second
  // ring around each arrow would compete with the disc's own edge instead of
  // reading as one wheel. containerStyle is CapabilityButton's existing
  // escape hatch (built for a non-default background), applied here instead
  // of adding a new variant since this is the only call site that needs it.
  dpadArrow: { backgroundColor: "transparent", borderWidth: 0 },
});
