import { Ionicons } from "@expo/vector-icons";
import { ComponentProps, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommandEngine } from "../core/engine/CommandEngine";
import { StateStore } from "../core/state/StateStore";
import { CapabilityId, StreamingService } from "../core/types/Capability";
import { Device } from "../core/types/Device";
import { DeviceState } from "../core/types/DeviceState";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";
import { useResponsiveScale } from "./useResponsiveScale";

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

function has(device: Device, capability: CapabilityId): boolean {
  return device.capabilities.includes(capability);
}

type IconName = ComponentProps<typeof Ionicons>["name"];

// Sean's reference (2026-09-10): a real remote app's secondary controls (mute, back, home, menu)
// read as one row of icon-over-caption chips, not horizontal icon+text pills — matches how a
// physical remote's own secondary buttons are labeled (engraved, small, below the button) rather
// than lettered inside it. One small local component since this exact pairing repeats 4 times in
// the utility row below.
function UtilityAction({
  icon,
  label,
  onPress,
  disabled,
  active,
  scale,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled: boolean;
  active?: boolean;
  scale: number;
}) {
  return (
    <View style={[styles.utilityAction, { width: 64 * scale }]}>
      <CapabilityButton shape="circle" scale={scale} icon={icon} label={label} variant={active ? "accent" : "ghost"} onPress={onPress} disabled={disabled} />
      <Text style={styles.utilityActionLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

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
const STREAMING_APPS: { service: StreamingService; label: string; bg: string; fg: string; fontScale?: number }[] = [
  { service: "netflix", label: "NETFLIX", bg: "#141414", fg: "#E50914" },
  { service: "hulu", label: "hulu", bg: "#1CE783", fg: "#0B0B0B", fontScale: 1.35 },
  { service: "primeVideo", label: "prime video", bg: "#0F171E", fg: "#00A8E1" },
  { service: "youtube", label: "YouTube", bg: "#141414", fg: "#FF0000" },
];

function StreamingAppTile({
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
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.streamingTile, { backgroundColor: bg }, disabled && styles.disabled]}
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
        style={[styles.streamingTileWordmark, { color: fg, fontSize: theme.type.label * fontScale }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Real-device finding (2026-09-10): "the card with the arrows... looks awful" — traced to a real
// misalignment, not a vague taste complaint. The d-pad column (up + gap + middle-row-with-the-
// large-Select-button + gap + down) is 196px tall; the volume/channel rocker columns beside it,
// gap-based with no matching height, were only ~136px — centered next to a taller neighbor, so
// their up/down buttons sat ~30px away from the d-pad's own up/down buttons instead of aligning
// with them. A real remote's side rockers align top-to-bottom with its d-pad; this one didn't.
const DPAD_HEIGHT = theme.circleDiameter.sm * 2 + theme.circleDiameter.lg + theme.spacing.md * 2;
// Real-device ask (2026-09-10): "fix the navigation of the up down arrows for volume and
// navigation to be more neatly oriented." The rockers already align top-to-bottom with the
// d-pad (the height-matching fix above) — what's left is that the d-pad reads as one wheel
// (ADR-HEARTH-037: a shared disc the arrows sit ON) while the Vol/Ch rockers are still two bare
// floating circles with a label between them, on the card's own plain background. Giving each
// rocker its own matching disc (same radius/border/surface treatment) makes all three columns
// read as one consistent family of controls instead of one styled differently from the other
// two.
//
// Real-device regression, caught same day: the hub row's total width was already exactly
// tuned to fit a 375pt screen (ADR-HEARTH-016: "316px... ~11px to spare") assuming each rocker
// was exactly as wide as its own 52px button (no extra container width, just centered content).
// An earlier version of this fix used circleDiameter.lg (68) per rocker, adding ~32px total
// across both rockers — 21px past that budget, which is exactly the kind of overflow that pushes
// a row into wrapping onto a second line ("now the icons at the bottom span two lines"). Using
// circleDiameter.sm (52, the button's own diameter) instead keeps the disc exactly as wide as
// the button it holds — same total hub-row width as before this whole rocker-disc change, so the
// original, already-verified-fitting arithmetic is preserved exactly. The button sits tangent to
// the pill's own rounded sides, the same "arrow tangent to its disc's rim" relationship the
// d-pad's own arrows already have to their disc (ADR-HEARTH-037) — a deliberate visual echo, not
// a compromise.
const ROCKER_WIDTH = theme.circleDiameter.sm;

const KEYPAD_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];
const MAX_CHANNEL_DIGITS = 4; // no real-world channel number needs more than this; guards against a runaway digit sequence being sent to the device

/**
 * One remote screen that works for any TV driver. Every control shown here is gated on the
 * device's declared capabilities — this file has no Samsung- or LG-specific logic at all.
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
  // DPAD_HEIGHT itself stays the fixed, already-verified base measurement
  // (the "196 = 196, arrows land tangent to the disc" math in the styles
  // below is derived from it) -- this is that same value scaled for the
  // current device, applied at each JSX call site that needs a real
  // (non-percentage) pixel size, same reasoning as CapabilityButton's own
  // scale prop.
  const scaledDpadSize = DPAD_HEIGHT * scale;
  const scaledSmDiameter = theme.circleDiameter.sm * scale;
  const [state, setState] = useState<DeviceState>(() => stateStore.get(device.id));
  const [channelInput, setChannelInput] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(device.name);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState("");
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
  const [activeTab, setActiveTab] = useState<"remote" | "keypad">("remote");
  // Sean's reference (2026-09-10): volume/channel rockers sit directly beside the d-pad as one
  // control cluster, not stacked as separate cards above it. Only devices with a d-pad (LG,
  // Samsung, Roku) get that merged layout; Sony has volume but no d-pad or channel keys at all,
  // so it keeps the older standalone rocker card as a fallback — see the render below.
  const hasDpad = has(device, "directionalNavigation");

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

  function appendChannelDigit(digit: string) {
    setChannelInput((current) => (current.length >= MAX_CHANNEL_DIGITS ? current : current + digit));
  }

  function submitChannelInput() {
    if (channelInput.length === 0) return;
    send("setChannel", { channel: Number(channelInput) });
    setChannelInput("");
  }

  const isOn = state.values.power === "on";
  const volume = typeof state.values.volume === "number" ? state.values.volume : undefined;
  const channel = typeof state.values.channel === "number" ? state.values.channel : undefined;
  const muted = state.values.muted === true;
  const input = typeof state.values.input === "string" ? state.values.input : undefined;
  // LG's real input ids/labels, read live off the TV (LgWebOsDriver's refreshInputList) — never
  // knowable ahead of time the way Roku/Sony's fixed hdmi1/hdmi2/hdmi3 buttons are. Absent for
  // every other driver, which falls back to that static list below.
  const dynamicInputs = Array.isArray(state.values.inputs)
    ? (state.values.inputs as unknown[]).filter(
        (entry): entry is { id: string; label: string } =>
          typeof entry === "object" && entry !== null && typeof (entry as Record<string, unknown>).id === "string"
      )
    : undefined;
  const isConnected = state.connection === "connected";
  // Real-hardware finding (2026-09-09): a persisted device reappears in the device list
  // immediately on app load, but its live driver connection reconnects separately in the
  // background (App.tsx) and can fail silently. Without this, every button stayed fully
  // interactive regardless of `isConnected` and produced a raw "not connected" error on tap —
  // confusing, since nothing on screen indicated why. Every action control below is now gated
  // on this, matching the status pill that already showed the (previously ignored) real state.
  const controlsDisabled = !isConnected;

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]}>
      {/* Sean, directly: "power off should be top left or right." Sourced: LG's own official
          ThinQ remote app puts Power in a compact top row alongside volume/mute/home, not as a
          large standalone button — every physical remote and every real remote app treats power
          as a top-corner icon, never a centered hero control. Moved here from its own dedicated
          row for exactly that reason. */}
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to devices" hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerDivider}>|</Text>
        <View style={styles.headerText}>
          {editingName ? (
            <TextInput
              style={styles.deviceNameInput}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
              selectTextOnFocus
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={commitNameEdit}
              onBlur={commitNameEdit}
            />
          ) : (
            <Pressable
              style={styles.deviceNameRow}
              onPress={() => setEditingName(true)}
              accessibilityRole="button"
              accessibilityLabel={`Rename ${device.name}`}
            >
              <Text style={styles.deviceName}>{device.name}</Text>
              <Ionicons name="pencil-outline" size={14} color={theme.textTertiary} />
            </Pressable>
          )}
          <Text style={styles.deviceMeta}>
            {device.manufacturer} {device.model}
          </Text>
        </View>
        {has(device, "power") && (
          <CapabilityButton
            shape="circle"
            scale={scale}
            icon="power"
            label="Power"
            variant="accent"
            onPress={() => send("power")}
            disabled={controlsDisabled}
          />
        )}
        {has(device, "powerOn") && (
          <CapabilityButton
            shape="circle"
            scale={scale}
            icon="power"
            label="Power On"
            variant="accent"
            onPress={() => send("powerOn")}
            disabled={controlsDisabled}
          />
        )}
        {has(device, "powerOff") && (
          <CapabilityButton
            shape="circle"
            scale={scale}
            icon="power-outline"
            label="Power Off"
            variant="ghost"
            onPress={() => send("powerOff")}
            disabled={controlsDisabled}
          />
        )}
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.statusPill, isConnected ? styles.statusPillOn : styles.statusPillOff]}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? theme.statusOn : theme.statusOff }]} />
          <Text style={styles.statusPillText}>{isConnected ? "Connected" : state.connection}</Text>
        </View>
        <View style={styles.statusPill}>
          <Ionicons name={isOn ? "power" : "power-outline"} size={14} color={theme.textSecondary} />
          <Text style={styles.statusPillText}>{isOn ? "On" : "Off"}</Text>
        </View>
        {volume !== undefined && (
          <View style={styles.statusPill}>
            <Ionicons name={muted ? "volume-mute-outline" : "volume-medium-outline"} size={14} color={theme.textSecondary} />
            <Text style={styles.statusPillText}>{volume}</Text>
          </View>
        )}
        {channel !== undefined && (
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>Ch {channel}</Text>
          </View>
        )}
        {input !== undefined && (
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>{input}</Text>
          </View>
        )}
      </View>

      {isConnected && commandError ? (
        <View style={styles.commandErrorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
          <Text style={styles.commandErrorText}>{commandError}</Text>
        </View>
      ) : null}

      {!isConnected && (
        <View style={styles.reconnectCard}>
          <View style={styles.reconnectTextGroup}>
            <Text style={styles.reconnectTitle}>Not connected</Text>
            {reconnectError ? (
              <Text style={styles.reconnectError}>{reconnectError}</Text>
            ) : (
              <Text style={styles.reconnectBody}>Controls are disabled until this reconnects.</Text>
            )}
          </View>
          {/* Real-device finding (2026-09-10), same bug as the Input buttons above: CapabilityButton
              never shows both an icon and visible label together, so this button — reconnecting or
              not — was rendering as a bare refresh glyph with no visible text at all. No icon here now. */}
          <CapabilityButton
            label={reconnecting ? "Reconnecting…" : "Reconnect"}
            variant="accent"
            onPress={handleReconnectPress}
            disabled={reconnecting}
          />
        </View>
      )}

      {hasKeypad && (
        <View style={styles.tabBar}>
          <Pressable style={[styles.tab, activeTab === "remote" && styles.tabActive]} onPress={() => setActiveTab("remote")}>
            <Text style={[styles.tabLabel, activeTab === "remote" && styles.tabLabelActive]}>Remote</Text>
          </Pressable>
          <Pressable style={[styles.tab, activeTab === "keypad" && styles.tabActive]} onPress={() => setActiveTab("keypad")}>
            <Text style={[styles.tabLabel, activeTab === "keypad" && styles.tabLabelActive]}>
              Keypad{channelInput.length > 0 ? ` (${channelInput})` : ""}
            </Text>
          </Pressable>
        </View>
      )}

      {(!hasKeypad || activeTab === "remote") && (
        <>
      {/* Sean's reference (2026-09-10): volume and channel rockers sit directly beside the d-pad
          as one control cluster — "everything in one place" — rather than as a separate card
          stacked above it. (A soft ambient glow behind the cluster was tried and removed
          2026-09-10 — real-device feedback: "why the random orange circle" — a flat-color View
          has no blur in React Native, so a decorative wash just reads as a hard-edged circle.) */}
      {hasDpad && (
        <View style={styles.hubCard}>
          <View style={styles.hubRow}>
            {(has(device, "volumeUp") || has(device, "volumeDown")) && (
              <View style={[styles.rockerColumn, { height: scaledDpadSize, width: ROCKER_WIDTH * scale, borderRadius: (ROCKER_WIDTH * scale) / 2 }]}>
                {has(device, "volumeUp") && (
                  <CapabilityButton
                    shape="circle"
                    scale={scale}
                    icon="chevron-up"
                    label="Vol +"
                    onPress={() => send("volumeUp")}
                    disabled={controlsDisabled}
                    containerStyle={styles.dpadArrow}
                  />
                )}
                <Text style={styles.rockerColumnLabel}>Vol</Text>
                {has(device, "volumeDown") && (
                  <CapabilityButton
                    shape="circle"
                    scale={scale}
                    icon="chevron-down"
                    label="Vol -"
                    onPress={() => send("volumeDown")}
                    disabled={controlsDisabled}
                    containerStyle={styles.dpadArrow}
                  />
                )}
              </View>
            )}
            <View style={[styles.dpad, { width: scaledDpadSize, height: scaledDpadSize, borderRadius: scaledDpadSize / 2 }]}>
              <CapabilityButton
                shape="circle"
                scale={scale}
                icon="chevron-up"
                label="Up"
                onPress={() => send("directionalNavigation", { direction: "up" })}
                disabled={controlsDisabled}
                containerStyle={styles.dpadArrow}
              />
              <View style={styles.dpadMiddleRow}>
                <CapabilityButton
                  shape="circle"
                  scale={scale}
                  icon="chevron-back"
                  label="Left"
                  onPress={() => send("directionalNavigation", { direction: "left" })}
                  disabled={controlsDisabled}
                  containerStyle={styles.dpadArrow}
                />
                {has(device, "select") ? (
                  <CapabilityButton
                    shape="circle"
                    scale={scale}
                    size="lg"
                    icon="checkmark"
                    label="Select"
                    variant="accent"
                    onPress={() => send("select")}
                    disabled={controlsDisabled}
                  />
                ) : (
                  <View style={[styles.dpadCenterSpacer, { width: scaledSmDiameter, height: scaledSmDiameter }]} />
                )}
                <CapabilityButton
                  shape="circle"
                  scale={scale}
                  icon="chevron-forward"
                  label="Right"
                  onPress={() => send("directionalNavigation", { direction: "right" })}
                  disabled={controlsDisabled}
                  containerStyle={styles.dpadArrow}
                />
              </View>
              <CapabilityButton
                shape="circle"
                scale={scale}
                icon="chevron-down"
                label="Down"
                onPress={() => send("directionalNavigation", { direction: "down" })}
                disabled={controlsDisabled}
                containerStyle={styles.dpadArrow}
              />
            </View>
            {(has(device, "channelUp") || has(device, "channelDown")) && (
              <View style={[styles.rockerColumn, { height: scaledDpadSize, width: ROCKER_WIDTH * scale, borderRadius: (ROCKER_WIDTH * scale) / 2 }]}>
                {has(device, "channelUp") && (
                  <CapabilityButton
                    shape="circle"
                    scale={scale}
                    icon="chevron-up"
                    label="Ch +"
                    onPress={() => send("channelUp")}
                    disabled={controlsDisabled}
                    containerStyle={styles.dpadArrow}
                  />
                )}
                <Text style={styles.rockerColumnLabel}>Ch</Text>
                {has(device, "channelDown") && (
                  <CapabilityButton
                    shape="circle"
                    scale={scale}
                    icon="chevron-down"
                    label="Ch -"
                    onPress={() => send("channelDown")}
                    disabled={controlsDisabled}
                    containerStyle={styles.dpadArrow}
                  />
                )}
              </View>
            )}
          </View>
        </View>
      )}

      {/* Fallback for a device with volume but no d-pad at all (Sony: no directionalNavigation,
          no channel keys) — the merged hub above needs a d-pad to anchor to, so this keeps volume
          reachable on its own rather than disappearing. */}
      {!hasDpad && (has(device, "volumeUp") || has(device, "volumeDown") || has(device, "channelUp") || has(device, "channelDown")) && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Volume &amp; Channel</Text>
          <View style={styles.rockerRow}>
            {(has(device, "volumeUp") || has(device, "volumeDown")) && (
              <View style={[styles.rockerColumn, { height: scaledDpadSize, width: ROCKER_WIDTH * scale, borderRadius: (ROCKER_WIDTH * scale) / 2 }]}>
                {has(device, "volumeUp") && (
                  <CapabilityButton
                    shape="circle"
                    scale={scale}
                    icon="chevron-up"
                    label="Vol +"
                    onPress={() => send("volumeUp")}
                    disabled={controlsDisabled}
                    containerStyle={styles.dpadArrow}
                  />
                )}
                <Text style={styles.rockerColumnLabel}>Vol</Text>
                {has(device, "volumeDown") && (
                  <CapabilityButton
                    shape="circle"
                    scale={scale}
                    icon="chevron-down"
                    label="Vol -"
                    onPress={() => send("volumeDown")}
                    disabled={controlsDisabled}
                    containerStyle={styles.dpadArrow}
                  />
                )}
              </View>
            )}
            {(has(device, "channelUp") || has(device, "channelDown")) && (
              <View style={[styles.rockerColumn, { height: scaledDpadSize, width: ROCKER_WIDTH * scale, borderRadius: (ROCKER_WIDTH * scale) / 2 }]}>
                {has(device, "channelUp") && (
                  <CapabilityButton
                    shape="circle"
                    scale={scale}
                    icon="chevron-up"
                    label="Ch +"
                    onPress={() => send("channelUp")}
                    disabled={controlsDisabled}
                    containerStyle={styles.dpadArrow}
                  />
                )}
                <Text style={styles.rockerColumnLabel}>Ch</Text>
                {has(device, "channelDown") && (
                  <CapabilityButton
                    shape="circle"
                    scale={scale}
                    icon="chevron-down"
                    label="Ch -"
                    onPress={() => send("channelDown")}
                    disabled={controlsDisabled}
                    containerStyle={styles.dpadArrow}
                  />
                )}
              </View>
            )}
          </View>
        </View>
      )}

      {/* Real-hardware research (2026-09-10): Roku (POST /launch/<channel id>) and LG
          (ssap://system.launcher/launch) both have real, verified app-launch mechanisms — see
          Capability.ts and each driver's own id mapping. Samsung/Sony don't declare "launchApp"
          because neither has a confirmed equivalent, not because this row forgot them. */}
      {has(device, "launchApp") && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Streaming Apps</Text>
          <View style={styles.streamingRow}>
            {STREAMING_APPS.map((app) => (
              <StreamingAppTile
                key={app.service}
                label={app.label}
                bg={app.bg}
                fg={app.fg}
                fontScale={app.fontScale}
                onPress={() => send("launchApp", { service: app.service })}
                disabled={controlsDisabled}
              />
            ))}
          </View>
        </View>
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

      {/* Real-device ask (2026-09-10): "the inputs should be above the card above" — reordered
          ahead of the utility row (Mute/Back/Home/Menu/...) rather than after it. */}
      {has(device, "inputSelection") && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Input</Text>
          {/* Real-device ask (2026-09-10): "change the arrangement of the inputs to be fewer
              rows" — the old styles.row (plain flexWrap, no column count) let the number of
              buttons per row vary with each label's own width, so a TV reporting several inputs
              with longer names (e.g. "Component", "Antenna") could wrap down to 2 per row,
              stretching a 6-7-input list to 3-4 rows. Fixed at 3 columns regardless of label
              length — deterministic row count (ceil(inputs/3)) instead of however-many-happen-
              to-fit. numberOfLines=1 on each button (CapabilityButton's own new, optional prop)
              keeps a longer label from wrapping to a second line and giving just that one tile a
              different height than its row-mates — same fix already applied to the utility row
              for the same reason. */}
          <View style={styles.inputGrid}>
            {(dynamicInputs ?? ["hdmi1", "hdmi2", "hdmi3"].map((id) => ({ id, label: id.toUpperCase() }))).map((option) => (
              <CapabilityButton
                key={option.id}
                label={option.label}
                variant={input === option.id ? "accent" : "default"}
                onPress={() => send("inputSelection", { input: option.id })}
                disabled={controlsDisabled}
                numberOfLines={1}
                containerStyle={styles.inputTile}
              />
            ))}
          </View>
        </View>
      )}

      {/* Sean's reference (2026-09-10): mute/back/home/menu read as one row of icon-over-caption
          chips — a physical remote's secondary buttons, small and labeled below rather than
          competing with the hub above for attention. Real-device ask (2026-09-10): "that card
          needs better spacing" — gap widened from spacing.md to spacing.lg and the card's own
          padding from spacing.lg to spacing.xl for more breathing room between and around these
          buttons than the denser hub/input cards need. */}
      {(has(device, "mute") ||
        has(device, "back") ||
        has(device, "home") ||
        has(device, "menu") ||
        has(device, "settings") ||
        has(device, "sleepTimer") ||
        has(device, "openSourceList")) && (
        <View style={[styles.card, styles.utilityCard]}>
          <View style={styles.utilityRow}>
            {has(device, "mute") && (
              <UtilityAction
                scale={scale}
                icon={muted ? "volume-mute" : "volume-medium-outline"}
                label={muted ? "Unmute" : "Mute"}
                active={muted}
                onPress={() => send("mute")}
                disabled={controlsDisabled}
              />
            )}
            {has(device, "back") && <UtilityAction scale={scale} icon="arrow-back-outline" label="Back" onPress={() => send("back")} disabled={controlsDisabled} />}
            {has(device, "home") && <UtilityAction scale={scale} icon="home-outline" label="Home" onPress={() => send("home")} disabled={controlsDisabled} />}
            {has(device, "menu") && <UtilityAction scale={scale} icon="menu-outline" label="Menu" onPress={() => send("menu")} disabled={controlsDisabled} />}
            {/* Real-hardware ask (2026-09-10): "settings and sleep timer should be next to
                eachother" — Samsung only; verified real KEY_TOOLS/KEY_SLEEP codes exist for this
                protocol specifically (see Capability.ts). LG/Roku don't declare these capabilities
                because their own public APIs genuinely have no equivalent — not omitted by
                oversight. */}
            {has(device, "settings") && <UtilityAction scale={scale} icon="settings-outline" label="Settings" onPress={() => send("settings")} disabled={controlsDisabled} />}
            {has(device, "sleepTimer") && <UtilityAction scale={scale} icon="moon-outline" label="Sleep" onPress={() => send("sleepTimer")} disabled={controlsDisabled} />}
            {/* Real-hardware research (2026-09-10): Samsung's KEY_SOURCE opens the TV's own
                on-screen source picker rather than jumping to a named input directly — a
                genuinely different mechanism from inputSelection, not the same feature under a
                different name (see ADR-HEARTH-027 and Capability.ts). The user drives the opened
                picker with the d-pad/select this driver already has. */}
            {has(device, "openSourceList") && (
              <UtilityAction scale={scale} icon="tv-outline" label="Source" onPress={() => send("openSourceList")} disabled={controlsDisabled} />
            )}
          </View>
        </View>
      )}
        </>
      )}

      {hasKeypad && activeTab === "keypad" && (
        <View style={styles.card}>
          <View style={styles.keypadHeader}>
            <Text style={styles.cardLabel}>Channel Number</Text>
            <Text style={styles.keypadDisplay}>{channelInput.length > 0 ? channelInput : "—"}</Text>
          </View>
          {KEYPAD_ROWS.map((digitRow) => (
            <View key={digitRow.join("")} style={styles.row}>
              {digitRow.map((digit) => (
                <CapabilityButton key={digit} shape="circle" scale={scale} label={digit} onPress={() => appendChannelDigit(digit)} disabled={controlsDisabled} />
              ))}
            </View>
          ))}
          <View style={styles.row}>
            <CapabilityButton
              shape="circle"
              scale={scale}
              icon="backspace-outline"
              label="Clear"
              variant="ghost"
              onPress={() => setChannelInput("")}
              disabled={controlsDisabled || channelInput.length === 0}
            />
            <CapabilityButton shape="circle" scale={scale} label="0" onPress={() => appendChannelDigit("0")} disabled={controlsDisabled} />
            <CapabilityButton
              shape="circle"
              scale={scale}
              icon="checkmark"
              label="Enter"
              variant="accent"
              onPress={submitChannelInput}
              disabled={controlsDisabled || channelInput.length === 0}
            />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  // Real bug found 2026-09-10: at spacing.xl (24) edge padding + the hub card's own horizontal
  // padding, the merged Vol/D-pad/Ch row (348px wide — see hubRow below) doesn't fit inside a
  // 375pt-wide iPhone (SE and similar) at all — 53px too wide, silently clipped by hubCard's
  // overflow:hidden. Caught by building an exact-dimension reconstruction and doing the actual
  // arithmetic, not by eyeballing it. Tightened to spacing.lg — a physical remote's controls sit
  // close together anyway, so tighter edges read as intentional, not cramped.
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
  content: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm },
  headerDivider: { color: theme.border, fontSize: theme.type.title, fontWeight: "300" },
  headerText: { flex: 1 },
  deviceName: { color: theme.textPrimary, fontSize: theme.type.title, fontWeight: "700" },
  deviceNameRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, alignSelf: "flex-start" },
  deviceNameInput: {
    color: theme.textPrimary,
    fontSize: theme.type.title,
    fontWeight: "700",
    borderBottomWidth: 1,
    borderBottomColor: theme.accentEnd,
    paddingVertical: theme.spacing.xs,
  },
  deviceMeta: { color: theme.textSecondary, fontSize: theme.type.body, marginTop: theme.spacing.xs },
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
  statusPillOn: { backgroundColor: theme.statusOnSoft },
  statusPillOff: { backgroundColor: theme.surfaceRaised },
  statusDot: { width: 7, height: 7, borderRadius: theme.radius.full },
  statusPillText: { color: theme.textSecondary, fontSize: theme.type.caption, fontWeight: "600" },
  reconnectCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    backgroundColor: theme.statusErrorSoft,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.statusError,
    padding: theme.spacing.lg,
  },
  reconnectTextGroup: { flex: 1, gap: theme.spacing.xs },
  reconnectTitle: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "700" },
  reconnectBody: { color: theme.textSecondary, fontSize: theme.type.label },
  reconnectError: { color: theme.statusError, fontSize: theme.type.label },
  commandErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.statusErrorSoft,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  commandErrorText: { color: theme.statusError, fontSize: theme.type.label, flex: 1 },
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
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  // Real-device ask (2026-09-10): "that card needs better spacing" — more generous padding than
  // the base `card` for the utility row specifically, since a sparse row of a few icon+caption
  // chips reads as cramped at the same padding a denser card (the hub, the keypad) uses well.
  utilityCard: { padding: theme.spacing.xl },
  cardLabel: {
    color: theme.textSecondary,
    fontSize: theme.type.label,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: { flexDirection: "row", gap: theme.spacing.md, alignItems: "center", justifyContent: "center", flexWrap: "wrap" },
  // Fixed 3-column grid for input-selection (see the call site's own comment) — same
  // flexBasis-percentage + gap technique DeviceListScreen.tsx's addGrid already uses for its own
  // 2-column layout: 3 × 31% = 93%, leaving real margin for the gap between tiles (2 gaps of
  // spacing.sm ≈ 5% of this card's interior width) without overflowing 100%.
  inputGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  // No flexGrow: a remainder tile on the last row (e.g. 7 inputs = two full rows + one leftover)
  // must NOT stretch to fill the row on its own — that's the exact "boxes not the same size" bug
  // the streaming row's own fix (above) already had to correct for the same reason.
  inputTile: { flexBasis: "31%" },
  rockerRow: { flexDirection: "row", gap: theme.spacing.xl, alignItems: "center", justifyContent: "center" },
  // Real-device ask (2026-09-10): "fix the navigation of the up down arrows... to be more
  // neatly oriented" — see the ROCKER_WIDTH comment above. Same surface/border treatment as
  // `dpad` below (theme.surfaceRaised fill, theme.border outline) so the Vol/Ch columns read as
  // matching discs beside the d-pad's own, not two differently-styled control types next to each
  // other. paddingVertical keeps the Up/Down buttons from touching the pill's own rounded caps.
  rockerColumn: {
    alignItems: "center",
    justifyContent: "space-between",
    height: DPAD_HEIGHT,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.border,
  },
  rockerColumnLabel: {
    color: theme.textTertiary,
    fontSize: theme.type.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
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
  // Real-device feedback (2026-09-10): "settings and sleep timer overlap" — Samsung's utility row
  // can now hold up to 6 items (mute/back/home/menu/settings/sleepTimer); 6×52px alone (312px)
  // already exceeds a 375pt screen's available width before a single gap is added, let alone at
  // the old spacing.xl gaps. flexWrap lets a row that's grown past its device's original 4-item
  // assumption fold onto a second line instead of overflowing into whatever renders next.
  //
  // Real-device regression (2026-09-11): "i want the remote page to be 1 page, now the icons at
  // the bottom span two lines" — checked the arithmetic this row was never actually verified
  // against, unlike the hub row's own cited "316px, ~11px to spare" calculation. At the previous
  // spacing.lg (16) gap, even LG's plain 4-item set (mute/back/home/menu, no settings/sleepTimer
  // at all) needs 4×64 + 3×16 = 304px against this card's ~295px available content width (375
  // baseline − 32px outer content padding − 48px utilityCard's own padding) — 9px over budget,
  // enough to force an unwanted wrap for a device that was never meant to need one. Tightened to
  // spacing.sm (8): 4×64 + 3×8 = 280px, comfortably under budget. Samsung's 6-item case (already
  // over budget even at 52px alone) still wraps by design — that's expected, not a bug; only the
  // unintended LG-sized wrap is what this fixes.
  utilityRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, alignItems: "flex-start", justifyContent: "center" },
  // Real-device finding (2026-09-10): "the settings label/button is still overlapping" — an
  // unconstrained-width column meant a longer caption ("Settings") could wrap to a second line
  // while its siblings ("Mute", "Home") stayed single-line, giving that one item a different
  // total height than the row it wrapped alongside — visually reading as two rows overlapping.
  // Fixed width + single line + tail-ellipsis makes every utility action exactly the same height,
  // no matter how long its label is, so a wrapped grid can never have mismatched row heights.
  utilityAction: { alignItems: "center", gap: theme.spacing.xs, width: 64 },
  utilityActionLabel: { color: theme.textSecondary, fontSize: theme.type.caption, fontWeight: "600", textAlign: "center" },
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
  streamingTile: {
    width: "22%",
    aspectRatio: 1.6,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xs,
  },
  streamingTileWordmark: { fontSize: theme.type.label, fontWeight: "700", letterSpacing: 0.3, textAlign: "center" },
  disabled: { opacity: 0.35 },
  keypadHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  keypadDisplay: { color: theme.textPrimary, fontSize: theme.type.title, fontWeight: "700", letterSpacing: 2, minWidth: 48, textAlign: "right" },
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
