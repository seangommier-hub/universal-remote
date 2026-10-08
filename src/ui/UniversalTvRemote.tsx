import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommandEngine } from "../core/engine/CommandEngine";
import { StateStore } from "../core/state/StateStore";
import { CapabilityId } from "../core/types/Capability";
import { Device } from "../core/types/Device";
import { DeviceState } from "../core/types/DeviceState";
import { fireHapticClick } from "./CapabilityButton";
import { CommandErrorBanner } from "./CommandErrorBanner";
import { deriveRemoteViewState } from "./deriveRemoteViewState";
import { DPAD_HEIGHT } from "./dpadLayout";
import { DpadCluster } from "./DpadCluster";
import { has } from "./hasCapability";
import { InputSelectionCard } from "./InputSelectionCard";
import { KeyboardCard } from "./KeyboardCard";
import { KeypadCard } from "./KeypadCard";
import { MediaBrowseModal } from "./MediaBrowseModal";
import { ReconnectCard } from "./ReconnectCard";
import { RemoteHeaderRow } from "./RemoteHeaderRow";
import { RemoteStatusRow } from "./RemoteStatusRow";
import { RemoteTabBar } from "./RemoteTabBar";
import { SleepTimerModal } from "./SleepTimerModal";
import { StreamingAppsRow } from "./StreamingAppsRow";
import { theme } from "./theme";
import { TouchpadModal } from "./TouchpadModal";
import { useCallCommandCenterButton } from "./useCallCommandCenterButton";
import { useConnectivityMode } from "./useConnectivityMode";
import { useDpadSeekMultiplier } from "./useDpadSeekMultiplier";
import { useDpadSwipeGesture } from "./useDpadSwipeGesture";
import { useKeepScreenAwake } from "./useKeepScreenAwake";
import { useRemoteFitScale } from "./useRemoteFitScale";
import { useResponsiveScale } from "./useResponsiveScale";
import { useSwipeBackGesture } from "./useSwipeBackGesture";
import { useUniversalSleepTimer } from "./useUniversalSleepTimer";
import { UtilityActionsRow } from "./UtilityActionsRow";
import { VolumeChannelCard } from "./VolumeChannelCard";

interface UniversalTvRemoteProps {
  device: Device;
  commandEngine: CommandEngine;
  stateStore: StateStore;
  /** Retries the driver connection — surfaced because a persisted device can reappear in the
   * list before its background reconnect (App.tsx) finishes, and that reconnect can fail
   * silently with no other way to retry short of restarting the whole app. */
  onReconnect: () => Promise<void>;
  /** Renames a device — real-device feedback (2026-09-10): "the name should be able to be
   * edited." Previously only set once, at pairing time, with no way to change it after. */
  onRename: (device: Device, newName: string) => void;
  /** Returns to the device list. Used to be a separate row/button rendered above this whole
   * screen in App.tsx — moved in here per real-device feedback (2026-09-10): "tv name should be
   * next to the back button separated by |". */
  onBack: () => void;
}

const MAX_CHANNEL_DIGITS = 4; // no real-world channel number needs more than this; guards against a runaway digit sequence being sent to the device

const MS_PER_SECOND = 1000;

/**
 * One remote screen that works for any TV driver. Every control shown here is gated on the
 * device's declared capabilities — this file has no Samsung- or LG-specific logic at all.
 *
 * This is the orchestrator: it owns the screen's state/effects and composes the extracted
 * sub-components below (ADR-HEARTH-205) — DpadCluster/VolumeChannelCard (the d-pad hub and its
 * no-d-pad fallback), StreamingAppsRow (Netflix/Hulu/Prime/YouTube), UtilityActionsRow
 * (Home/Menu/Mute/Back/...), KeypadCard/KeyboardCard (the Keypad/Keyboard tabs) and
 * SleepTimerModal — each a small, single-purpose file under src/ui/.
 */
export function UniversalTvRemote({ device, commandEngine, stateStore, onReconnect, onRename, onBack }: UniversalTvRemoteProps) {
  // See DiscoverDevicesScreen.tsx's identical comment — a hardcoded paddingTop guessed for an
  // iPhone notch never accounted for Android's own, differently-sized status bar.
  const insets = useSafeAreaInsets();
  // Real-device design pass (2026-09-11), Sean directly: "dynamic for any
  // device." Scales every circular touch target on this screen (d-pad,
  // rockers, keypad, utility row) relative to the actual window width
  // instead of the fixed-pixel sizes they were tuned against on one
  // reference screen — see useResponsiveScale.ts for why this is the
  // right axis to scale (and font size/spacing deliberately are not).
  const scale = useResponsiveScale();
  // ADR-HEARTH-204: "the increase in speed should be due to multiple taps" — a fast streak of
  // same-direction d-pad left/right taps shows an escalating 2x/5x/10x/20x label near the d-pad.
  // Every tap still sends exactly one real directionalNavigation command (see leftRight below);
  // this hook only tracks tap cadence for the on-screen label.
  const dpadSeek = useDpadSeekMultiplier();
  const connectivityMode = useConnectivityMode();
  // ADR-HEARTH-213: "there needs to be a button in the hearth app on all of the tvs it can be
  // called from" (Sean, directly) -- a manual, always-available check independent of whatever
  // Hearth's own debounced outage detection currently believes (OfflineAlertBanner.tsx's own
  // "Retry" only appears once that detection has already decided there's a problem).
  const commandCenter = useCallCommandCenterButton();
  // ADR-HEARTH-183: keep the screen from auto-locking only while a remote is actually open —
  // scoped by this component's own mount/unmount (see useKeepScreenAwake's own doc comment), never
  // the whole app.
  useKeepScreenAwake();
  const isAway = connectivityMode === "away";
  const [state, setState] = useState<DeviceState>(() => stateStore.get(device.id));
  const [channelInput, setChannelInput] = useState("");
  const [keyboardInput, setKeyboardInput] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(device.name);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState("");
  // ADR-HEARTH-182: media_player browse_media, offered as one more utility-row button next to Source/Settings.
  const [browsing, setBrowsing] = useState(false);
  // ADR-HEARTH-215: real pointer control (drag-to-move, tap-to-click), offered next to Touchpad's button in the utility row.
  const [touchpadOpen, setTouchpadOpen] = useState(false);
  // Real gap found in review (2026-09-09): `send()` fired commandEngine.execute() without
  // awaiting it, so a failed command (device dropped mid-press, TV rejected the request) vanished
  // silently — CommandEngine.execute() never throws, it resolves a CommandResult either way, so
  // nothing was there to catch. A user pressing a button and seeing nothing happen, with no
  // indication why, is exactly the kind of silent failure the reconnect-banner work this session
  // was already trying to eliminate. Auto-dismisses so a transient miss doesn't linger.
  const [commandError, setCommandError] = useState("");
  const commandErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sean: "it shouldn't require scrolling." A device with every section active (LG: power,
  // volume/channel, keypad, d-pad, back/home/menu) genuinely doesn't fit one screen — the
  // 4-row numeric keypad alone is the single biggest contributor. Splitting it into its own tab
  // is the one change that actually buys back a screen's worth of height, rather than
  // incrementally shrinking padding everywhere. Only shown when there's something to split.
  const hasKeypad = has(device, "setChannel");
  // Sean, directly (2026-09-16): "add a keyboard so that the user can type usernames and
  // passwords rather than having to navigate to each letter on screen, put this as an additional
  // tab like the keypad." Same tab-split reasoning as hasKeypad above — only shown when the
  // device's driver actually implements textEntry (Roku/LG; see Capability.ts's citation for why
  // Samsung/Sony don't).
  const hasKeyboard = has(device, "textEntry");
  const [activeTab, setActiveTab] = useState<"remote" | "keypad" | "keyboard">("remote");
  // Sean, directly (2026-10-07): "the remote should have a dynamic layout where it is able to be
  // on one screen no matter the device... it shouldn't need to scroll." useResponsiveScale above
  // is width-only by design (ADR-HEARTH-040) and never reacts to actual rendered height, so a
  // capability combination it wasn't hand-tuned against still overflows (ui-verify measured LG's
  // real worst case: 89px at the iPhone 17's 393x852 frame). This is the height-aware correction:
  // measures this screen's real available vs. rendered height and shrinks the fit-aware sizes
  // below (the d-pad hub as one whole unit, plus a few cards' own padding/gaps -- never the
  // smaller utility/streaming/input buttons' own tap targets, see each call site's own comment)
  // until it fits, converging to a stop rather than looping forever (fitScale.ts). Keyed by
  // device+tab so switching to a smaller tab (e.g. Keypad) or a different device starts fresh
  // instead of staying shrunk for content that never needed it.
  const fit = useRemoteFitScale(`${device.id}:${activeTab}`);
  // DPAD_HEIGHT itself stays the fixed, already-verified base measurement
  // (the "196 = 196, arrows land tangent to the disc" math in DpadCluster.tsx's
  // own styles is derived from it) -- this is that same value scaled for the
  // current device AND the fit correction above, applied at each JSX call
  // site that needs a real (non-percentage) pixel size, same reasoning as
  // CapabilityButton's own scale prop. Combined into one `hubScale` (rather
  // than passing `scale` and `fit.fitScale` down separately) so the whole
  // d-pad/rocker/center-button assembly always shrinks together as one unit
  // -- DpadCluster's own arrows are tuned to land exactly tangent to the
  // disc's rim (ADR-HEARTH-037); scaling the container without also scaling
  // what sits on it the same amount would break that geometry.
  const hubScale = scale * fit.fitScale;
  const scaledDpadSize = DPAD_HEIGHT * hubScale;
  const scaledSmDiameter = theme.circleDiameter.sm * hubScale;
  // Sean's reference (2026-09-10): volume/channel rockers sit directly beside the d-pad as one
  // control cluster, not stacked as separate cards above it. Only devices with a d-pad (LG,
  // Samsung, Roku) get that merged layout; Sony has volume but no d-pad or channel keys at all,
  // so it keeps the older standalone rocker card as a fallback — see VolumeChannelCard below.
  const hasDpad = has(device, "directionalNavigation");
  // Real-hardware/competitive research (2026-09-16, ADR-HEARTH-074): Apple TV Remote's signature
  // feature, layered on top of (not replacing) the existing arrow buttons — see
  // useDpadSwipeGesture.ts's own doc comment for the full citation and the honest caveat that
  // this hasn't been verified end-to-end against a real device this session.
  const dpadSwipeHandlers = useDpadSwipeGesture((direction) => {
    if (controlsDisabled) return;
    fireHapticClick();
    send("directionalNavigation", { direction });
  });

  async function handleReconnectPress() {
    setReconnecting(true);
    setReconnectError("");
    try {
      await onReconnect();
      // No manual state update needed on success — the driver's own connect() sets
      // connection: "connected" through stateStore, which this screen already subscribes to.
    } catch (err) {
      setReconnectError(err instanceof Error ? err.message : String(err));
    } finally {
      setReconnecting(false);
    }
  }

  // "Make it easier to connect": don't make the user notice a device is disconnected and then
  // tap Reconnect themselves — try immediately when they open its remote screen, the same way
  // opening an app doesn't ask you to manually rejoin WiFi first. The per-driver backoff
  // (ADR-HEARTH-017) and the app-foreground listener (App.tsx) both cover the general case; this
  // covers the specific moment a user is looking right at the screen wanting to use it now.
  useEffect(() => {
    if (stateStore.get(device.id).connection !== "connected") {
      handleReconnectPress();
    }
    // Only on first mount / when navigating to a different device — not on every state change,
    // which would otherwise re-fire this every time the driver's own retries update the state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id]);

  useEffect(() => {
    setState(stateStore.get(device.id));
    return stateStore.subscribe(device.id, setState);
  }, [device.id, stateStore]);

  useEffect(() => {
    // Navigating to a different device (or leaving the screen) shouldn't leave a stale error
    // from the previous device hanging around, and shouldn't leak the pending clear timer.
    setCommandError("");
    return () => {
      if (commandErrorTimer.current) clearTimeout(commandErrorTimer.current);
    };
  }, [device.id]);

  useEffect(() => {
    // Same reasoning as the commandError effect above — an in-progress rename of a previous
    // device shouldn't still be open (or overwrite the wrong device) after navigating away.
    setEditingName(false);
    setNameInput(device.name);
  }, [device.id, device.name]);

  function commitNameEdit() {
    setEditingName(false);
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== device.name) {
      onRename(device, trimmed);
    } else {
      setNameInput(device.name); // discard an empty/unchanged edit rather than leave a blank field
    }
  }

  function send(capability: CapabilityId, args?: Record<string, unknown>) {
    commandEngine.execute({ deviceId: device.id, capability, args }).then((result) => {
      if (result.success) return;
      if (commandErrorTimer.current) clearTimeout(commandErrorTimer.current);
      setCommandError(result.error?.message ?? "Command failed");
      commandErrorTimer.current = setTimeout(() => setCommandError(""), 4000);
    });
  }

  // Sean, directly (2026-09-20): "there should be a method for a sleep function on any tv to be
  // easily activated." See useUniversalSleepTimer.ts's own doc comment for the full reasoning.
  const sleepTimer = useUniversalSleepTimer(device, send);

  // ADR-HEARTH-204: left/right only (up/down have no seek/scrub meaning on a d-pad) — sends the
  // exact same one directionalNavigation command a plain tap always has, then feeds the tap to
  // useDpadSeekMultiplier purely for the on-screen fast-tap-streak label.
  function pressDpadSeekDirection(direction: "left" | "right") {
    send("directionalNavigation", { direction });
    dpadSeek.registerTap(direction);
  }

  // ADR-HEARTH-136: like a physical remote, every digit goes to the device the moment it is pressed
  // (so a PIN screen, a channel entry, or anything else that reads digits works), rather than being
  // collected and sent as one number — which also dropped leading zeros. The display is only an echo.
  function pressKeypadDigit(digit: string) {
    setChannelInput((current) => (current.length >= MAX_CHANNEL_DIGITS ? digit : current + digit));
    send("setChannel", { digits: digit });
  }

  // ADR-HEARTH-139: Sean wants play, pause and select all on the one center button. LG cannot report
  // whether video is playing, so tap stays a plain OK (what a real Magic Remote does) and a hold
  // sends the explicit real Pause, then Play on the next hold, alternating. A tap resets the
  // alternation, since an OK may itself have paused or resumed the video.
  const lastHoldRef = useRef<"pause" | "play" | null>(null);
  function pressCenterSelect() {
    lastHoldRef.current = null;
    send("selectPlayPause");
  }
  function holdCenterPlayPause() {
    const next = lastHoldRef.current === "pause" ? "play" : "pause";
    lastHoldRef.current = next;
    fireHapticClick();
    send(next);
  }

  function pressKeypadEnter() {
    send(has(device, "selectPlayPause") ? "selectPlayPause" : "select");
    setChannelInput("");
  }

  function submitKeyboardInput() {
    if (keyboardInput.length === 0) return;
    send("textEntry", { text: keyboardInput });
    setKeyboardInput("");
  }

  // See deriveRemoteViewState.ts for the full reasoning behind each of these (ADR-HEARTH-205
  // pulled this pure derivation out of the orchestrator; no logic changed).
  const {
    knownPower,
    hasSeparatePowerOnOff,
    hasNativeSleepTimer,
    canUniversalSleep,
    utilityColumns,
    volume,
    channel,
    muted,
    knownMuted,
    input,
    playbackState,
    dynamicInputs,
    isConnected,
    controlsDisabled,
    statusLine,
  } = deriveRemoteViewState(device, state, connectivityMode, reconnectError);
  const swipeBackHandlers = useSwipeBackGesture(onBack);

  // ADR-HEARTH-180: VoiceOver/TalkBack reads this screen once, on focus — a connection status
  // flip (e.g. the TV drops mid-use) or a failed command otherwise has no way to reach someone
  // who isn't looking at the screen right now. announceForAccessibility interrupts with the new
  // text on both platforms; accessibilityLiveRegion="polite"/"assertive" on the pill/banner below
  // covers Android TalkBack's own live-region mechanism for the same text. The ref skips the very
  // first render so opening the screen doesn't announce the starting status on top of VoiceOver's
  // own "screen changed" announcement.
  const announcedStatusRef = useRef(false);
  useEffect(() => {
    if (!announcedStatusRef.current) {
      announcedStatusRef.current = true;
      return;
    }
    AccessibilityInfo.announceForAccessibility(statusLine);
  }, [statusLine]);

  useEffect(() => {
    if (commandError) AccessibilityInfo.announceForAccessibility(commandError);
  }, [commandError]);

  return (
    // Sean, directly (2026-09-12): "add swiping to go back" — panHandlers on this wrapping View,
    // not the ScrollView itself, so PanResponder's edge-zone/direction-lock logic (see
    // useSwipeBackGesture) decides whether a touch is a horizontal swipe or a vertical scroll
    // before either the ScrollView or the swipe gesture claims it.
    <View style={styles.container} {...swipeBackHandlers}>
    <ScrollView
      onLayout={fit.onLayout}
      onContentSizeChange={fit.onContentSizeChange}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + theme.spacing.lg * fit.fitScale,
          paddingBottom: theme.spacing.md * fit.fitScale,
          gap: theme.spacing.sm * fit.fitScale,
        },
      ]}
    >
      <RemoteHeaderRow
        device={device}
        scale={scale}
        isAway={isAway}
        editingName={editingName}
        nameInput={nameInput}
        onChangeNameInput={setNameInput}
        onStartEdit={() => setEditingName(true)}
        onCommitEdit={commitNameEdit}
        onBack={onBack}
        knownPower={knownPower}
        hasSeparatePowerOnOff={hasSeparatePowerOnOff}
        disabled={controlsDisabled}
        onSend={send}
      />

      <RemoteStatusRow
        statusLine={statusLine}
        isConnected={isConnected}
        knownPower={knownPower}
        volume={volume}
        muted={muted}
        knownMuted={knownMuted}
        channel={channel}
        input={input}
      />

      {commandError ? <CommandErrorBanner message={commandError} /> : null}

      {!isConnected && <ReconnectCard reconnecting={reconnecting} reconnectError={reconnectError} onTryNow={handleReconnectPress} />}

      {(hasKeypad || hasKeyboard) && (
        <RemoteTabBar hasKeypad={hasKeypad} hasKeyboard={hasKeyboard} activeTab={activeTab} channelInput={channelInput} onSelectTab={setActiveTab} />
      )}

      {(!(hasKeypad || hasKeyboard) || activeTab === "remote") && (
        <>
      {/* Sean's reference (2026-09-10): volume and channel rockers sit directly beside the d-pad
          as one control cluster — "everything in one place" — rather than as a separate card
          stacked above it. (A soft ambient glow behind the cluster was tried and removed
          2026-09-10 — real-device feedback: "why the random orange circle" — a flat-color View
          has no blur in React Native, so a decorative wash just reads as a hard-edged circle.) */}
      {hasDpad && (
        <DpadCluster
          device={device}
          scale={hubScale}
          scaledDpadSize={scaledDpadSize}
          scaledSmDiameter={scaledSmDiameter}
          fitScale={fit.fitScale}
          disabled={controlsDisabled}
          playbackState={playbackState}
          seekMultiplier={dpadSeek.multiplier}
          dpadSwipeHandlers={dpadSwipeHandlers}
          onSend={send}
          onSeekDirection={pressDpadSeekDirection}
          onCenterSelect={pressCenterSelect}
          onHoldCenterPlayPause={holdCenterPlayPause}
        />
      )}

      {!hasDpad && (has(device, "volumeUp") || has(device, "volumeDown") || has(device, "channelUp") || has(device, "channelDown")) && (
        <VolumeChannelCard device={device} scale={hubScale} scaledDpadSize={scaledDpadSize} fitScale={fit.fitScale} disabled={controlsDisabled} onSend={send} />
      )}

      {/* Real-hardware research (2026-09-10): Roku (POST /launch/<channel id>) and LG
          (ssap://system.launcher/launch) both have real, verified app-launch mechanisms — see
          Capability.ts and each driver's own id mapping. Samsung/Sony don't declare "launchApp"
          because neither has a confirmed equivalent, not because this row forgot them. */}
      {has(device, "launchApp") && (
        <StreamingAppsRow onLaunch={(service) => send("launchApp", { service })} disabled={controlsDisabled} fitScale={fit.fitScale} />
      )}

      {/* A flex:1 spacer here previously tried to push the utility/Input cards toward the bottom
          of the screen (real-device ask: "why not have the menu items on the bottom of the
          screen?"). Removed 2026-09-10 — real-device finding: "the input box goes off the screen
          at the bottom." A flex:1 child competing for space inside a ScrollView whose
          contentContainerStyle also has flexGrow:1 is exactly the kind of layout ambiguity that
          causes content to be pushed out of the scrollable area instead of just visually
          bottom-anchored. A working Input selector matters more than this cosmetic effect; revisit
          bottom-anchoring later with a structure that doesn't put a flex:1 view inside scrollable
          content (e.g. a fixed-position footer outside the ScrollView) rather than retrying the
          same approach. */}

      {has(device, "inputSelection") && (
        <InputSelectionCard
          options={dynamicInputs}
          selectedInput={input}
          disabled={controlsDisabled}
          onSelect={(inputId) => send("inputSelection", { input: inputId })}
          fitScale={fit.fitScale}
        />
      )}

      {(has(device, "mute") ||
        has(device, "back") ||
        has(device, "home") ||
        has(device, "menu") ||
        has(device, "settings") ||
        hasNativeSleepTimer ||
        canUniversalSleep ||
        has(device, "openSourceList") ||
        has(device, "browseMedia")) && (
        <UtilityActionsRow
          device={device}
          scale={scale}
          fitScale={fit.fitScale}
          columns={utilityColumns}
          disabled={controlsDisabled}
          muted={muted}
          hasNativeSleepTimer={hasNativeSleepTimer}
          canUniversalSleep={canUniversalSleep}
          sleepActive={sleepTimer.sleepExpiresAt !== undefined}
          onSend={send}
          onOpenSleepPicker={sleepTimer.openPicker}
          onOpenBrowse={() => setBrowsing(true)}
          onOpenTouchpad={() => setTouchpadOpen(true)}
          commandCenterStatus={commandCenter.status}
          onCallCommandCenter={commandCenter.call}
        />
      )}
        </>
      )}

      {hasKeypad && activeTab === "keypad" && (
        <KeypadCard
          scale={scale}
          channelInput={channelInput}
          disabled={controlsDisabled}
          canSubmit={has(device, "selectPlayPause") || has(device, "select")}
          onPressDigit={pressKeypadDigit}
          onClear={() => setChannelInput("")}
          onEnter={pressKeypadEnter}
        />
      )}

      {hasKeyboard && activeTab === "keyboard" && (
        <KeyboardCard value={keyboardInput} disabled={controlsDisabled} onChangeValue={setKeyboardInput} onSubmit={submitKeyboardInput} />
      )}
    </ScrollView>

      <SleepTimerModal
        visible={sleepTimer.showSleepPicker}
        sleepExpiresAt={sleepTimer.sleepExpiresAt}
        onClose={sleepTimer.closePicker}
        onCancel={sleepTimer.cancel}
        onStart={sleepTimer.start}
      />

      <MediaBrowseModal visible={browsing} device={device} commandEngine={commandEngine} onClose={() => setBrowsing(false)} />
      <TouchpadModal visible={touchpadOpen} onSend={send} onClose={() => setTouchpadOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  // Real bug found 2026-09-10: at spacing.xl (24) edge padding + the hub card's own horizontal
  // padding, the merged Vol/D-pad/Ch row (348px wide — see DpadCluster.tsx's hubRow) doesn't fit
  // inside a 375pt-wide iPhone (SE and similar) at all — 53px too wide, silently clipped by
  // hubCard's overflow:hidden. Caught by building an exact-dimension reconstruction and doing the
  // actual arithmetic, not by eyeballing it. Tightened to spacing.lg — a physical remote's
  // controls sit close together anyway, so tighter edges read as intentional, not cramped.
  // Top safe-area clearance (now computed per-device via useSafeAreaInsets, applied inline at
  // the call site) restores what used to live in App.tsx's now-removed `backRow` wrapper — the
  // Back button moved into headerRow below (real-device feedback, 2026-09-10: "tv name should be
  // next to the back button"). No flexGrow here — it existed only
  // to support a flex:1 bottom-anchor spacer that's since been removed (real-device finding: it
  // pushed the Input card off the scrollable area).
  // gap tightened from spacing.md to spacing.sm — real-device ask (2026-09-10): "make it one page,
  // no scrolling on the initial page." A full LG-capability screen (header, status, tabs, hub,
  // streaming, input, utility row) adds up to real height across six-plus stacked cards; every
  // gap between them is one of a handful of places left to reclaim without shrinking a touch
  // target or undoing spacing just asked for elsewhere (the utility card's own padding).
  // ADR-HEARTH-135: padding lg->md so the whole remote fits an iPhone 17 without scrolling.
  // ADR-HEARTH-217: vertical padding and gap moved to the ScrollView's own contentContainerStyle
  // override above (paddingTop/paddingBottom/gap), scaled live by the fit-correction factor --
  // only horizontal padding is a fixed value here now, since the overflow this screen fights is
  // vertical, not horizontal (the width-fit arithmetic cited elsewhere on this screen already
  // assumes this exact spacing.md horizontal value and must keep it).
  content: { paddingHorizontal: theme.spacing.md },
});
