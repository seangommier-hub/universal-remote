import { ConnectivityMode, isPublicRouteCurrentlyFailing } from "../core/network/fccConnectivity";
import { CapabilityId } from "../core/types/Capability";
import { Device } from "../core/types/Device";
import { DeviceState } from "../core/types/DeviceState";
import { describeDeviceStatus } from "./describeDeviceStatus";
import { has } from "./hasCapability";

const MS_PER_SECOND = 1000;

export interface RemoteViewState {
  knownPower: "on" | "off" | undefined;
  hasSeparatePowerOnOff: boolean;
  hasNativeSleepTimer: boolean;
  canUniversalSleep: boolean;
  utilityColumns: number;
  volume: number | undefined;
  channel: number | undefined;
  muted: boolean;
  knownMuted: boolean | undefined;
  input: string | undefined;
  playbackState: unknown;
  dynamicInputs: { id: string; label: string }[] | undefined;
  isConnected: boolean;
  controlsDisabled: boolean;
  statusLine: string;
}

/**
 * Derives every plain display value the remote screen's header/status/hub/utility row read off
 * the device's live state — pulled out of UniversalTvRemote.tsx (ADR-HEARTH-205) as one pure
 * function so the orchestrator component doesn't carry this much non-UI logic inline. Takes no
 * React state of its own; the caller re-derives it on every render, same as before the split.
 */
export function deriveRemoteViewState(device: Device, state: DeviceState, connectivityMode: ConnectivityMode, reconnectError: string): RemoteViewState {
  // Real-hardware finding (2026-09-14, spotted while building XboxDriver.ts): this used to default
  // to "off" whenever state.values.power was simply undefined — honest for a device this screen
  // has real readback for (every driver that declares "power", plus Roku's read-only power state),
  // but XboxDriver never sets values.power at all (its own doc comment: no way to query power
  // state without a full authenticated session it doesn't implement) — the pill was quietly
  // claiming "Off" for a device that is, as far as this app can ever know, neither on nor off.
  // undefined here means exactly that: unknown, not "assume off" — the pill below now hides itself
  // rather than state a fact this app doesn't have.
  // ADR-HEARTH-133: a disconnected device keeps its last-known values, so an LG that dropped while
  // "on" kept claiming "On" — the power button then chose powerOff (and disabled itself) instead of
  // waking it. While disconnected the power state is genuinely unknown, so it is treated that way.
  const knownPower =
    state.connection === "connected" && (state.values.power === "on" || state.values.power === "off") ? state.values.power : undefined;
  // Real bug found live (2026-09-20): LgWebOsDriver is the first driver to declare BOTH powerOn
  // (Wake-on-LAN, ADR-HEARTH-102) and powerOff (SSAP) as separate capabilities — every earlier
  // driver had at most one of the two (Xbox/PS5: powerOn only; Roku: powerOff only), so this
  // screen's original "one button per declared capability" rendering never had to consider both
  // appearing on the same device together, and simply showed two power buttons side by side.
  // Collapsed into the same single toggle-feeling button "power"-capable devices (Sony/Samsung)
  // already get — the household shouldn't need to know which of two buttons is the "right" one
  // for a TV that's currently on vs. off, the same "one button, real remotes don't make you
  // choose" reasoning RemoteHeaderRow.tsx's own header documents for why Power lives there at all.
  const hasSeparatePowerOnOff = has(device, "powerOn") && has(device, "powerOff");
  // Sean, directly (2026-09-20): "there should be a method for a sleep function on any tv to be
  // easily activated." Samsung's real native sleepTimer (KEY_SLEEP) stays exactly as it is; every
  // other device that has SOME power-off mechanism gets this client-side countdown fallback
  // instead (see sleepTimerManager.ts's own doc comment for the full reasoning).
  const hasNativeSleepTimer = has(device, "sleepTimer");
  const canUniversalSleep = !hasNativeSleepTimer && (has(device, "power") || has(device, "powerOff"));
  // ADR-HEARTH-134: equal-width columns so the utility buttons spread evenly (one row up to 5 buttons, else 3 or 4 across, wrapping
  // to an even second row) instead of a ragged flex-wrap row of tiny chips.
  const utilityButtonCount =
    ["home", "menu", "mute", "back", "settings", "openSourceList", "browseMedia"].filter((capability) => has(device, capability as CapabilityId)).length +
    (hasNativeSleepTimer ? 1 : 0) +
    (canUniversalSleep ? 1 : 0);
  const utilityColumns = utilityButtonCount <= 5 ? Math.max(utilityButtonCount, 1) : utilityButtonCount === 6 ? 3 : 4;
  const volume = typeof state.values.volume === "number" ? state.values.volume : undefined;
  const channel = typeof state.values.channel === "number" ? state.values.channel : undefined;
  const muted = state.values.muted === true;
  // Real-hardware finding (2026-09-14), same audit as knownPower above: Roku and Samsung both
  // declare "mute" and track a real (if optimistic-only) muted value the moment it's pressed —
  // but neither ever populates values.volume at all (Roku's ECP has no numeric volume query;
  // Samsung's key-press-only channel has no readback of any kind), and the mute icon was only ever
  // rendered bundled inside the volume pill. Pressing Mute on either produced zero visible
  // feedback — not a wrong claim like knownPower's bug, but a real missing one. knownMuted lets a
  // standalone pill show once muted is known, independent of whether volume ever will be.
  const knownMuted = state.values.muted === true || state.values.muted === false ? state.values.muted : undefined;
  const input = typeof state.values.input === "string" ? state.values.input : undefined;
  // Real live media-playback state (ADR-HEARTH-051) — never a guess based on whether a streaming
  // app was launched. Only Roku and LG ever populate this (see Capability.ts's playPause entry
  // for the per-brand research: Samsung's protocol has no query mechanism at all, and Sony's
  // documented REST surface has no reliable playback-state field).
  //
  // Real-hardware correction (2026-09-15, ADR-HEARTH-068): ADR-HEARTH-051 originally had
  // "playing"/"paused" SWAP the center d-pad button into a play/pause toggle, hiding the
  // Select/checkmark button underneath whenever state was ambiguous. Two real, independent
  // reports broke that design in opposite directions: (1) Netflix's PIN-protected profile lock
  // makes /query/media-player's state genuinely ambiguous while a real app is still active — the
  // center button silently became Select, which doesn't reliably get a user past a PIN/keyboard
  // overlay, so the control felt "stuck"; (2) YouTube's in-video "Skip Ad" button appears while
  // Roku correctly reports state="play" — but that's exactly when the center button was Select's
  // OWN turn to disappear, so there was no way to tap Skip Ad at all. Both bugs are the same root
  // cause: one physical button can't be exclusively Select OR exclusively Play/Pause, because
  // real apps need either one at moments this driver can never reliably predict (deep research,
  // 2026-09-15: neither Home Assistant's mature Roku integration nor any other reviewed
  // remote-control product has solved this prediction problem either — it's a genuine, open gap
  // in what ECP/similar protocols can tell a client, not something this app was uniquely missing).
  // Fix: stop predicting. Select stays permanently in the d-pad center (its original, universal
  // role); playPause is now its own always-visible button (see DpadCluster.tsx's own row below
  // the d-pad) whenever the capability exists, regardless of playbackState. Its icon/label still
  // reflect real known state when available — this is now purely cosmetic, never gatekeeping.
  const playbackState = state.values.playbackState;
  // LG's real input ids/labels, read live off the TV (LgWebOsDriver's refreshInputList — which
  // also filters out "Sling TV" at the source now, ADR-HEARTH-060, so every consumer of
  // state.values.inputs agrees, not just this screen) — never knowable ahead of time the way
  // Roku/Sony's fixed hdmi1/hdmi2/hdmi3 buttons are. Absent for every other driver, which falls
  // back to InputSelectionCard's own static list.
  const dynamicInputs = Array.isArray(state.values.inputs)
    ? (state.values.inputs as unknown[]).filter(
        (entry): entry is { id: string; label: string } =>
          typeof entry === "object" && entry !== null && typeof (entry as Record<string, unknown>).id === "string"
      )
    : undefined;
  const isConnected = state.connection === "connected";
  // ADR-HEARTH-163: the existing connection pill carries the plain-language status line (no added height).
  const statusLine = describeDeviceStatus({
    connection: state.connection,
    knownPower,
    wakeBurstActive: state.values.waking === true,
    lastError: reconnectError || undefined,
    connectivityMode,
    // 2026-10-05: used to hardcode `true` whenever mode wasn't "unknown" -- that's "the relay
    // answered at SOME point this session", not "the relay answered recently", so a device stuck
    // on "away" kept claiming the relay was reachable straight through a real Pi outage (fixed by
    // isPublicRouteCurrentlyFailing() actually tracking the most recent public-route result; see
    // fccConnectivity.ts for the full story). Still undefined at "unknown" mode -- nothing's been
    // tried yet, which is different from "tried and failed".
    fccReachable: connectivityMode === "unknown" ? undefined : !isPublicRouteCurrentlyFailing(),
    secondsSinceLastSeen: Math.max(0, Math.round((Date.now() - state.lastUpdated) / MS_PER_SECOND)),
  });
  // Real-hardware finding (2026-09-09): a persisted device reappears in the device list
  // immediately on app load, but its live driver connection reconnects separately in the
  // background (App.tsx) and can fail silently. Without this, every button stayed fully
  // interactive regardless of `isConnected` and produced a raw "not connected" error on tap —
  // confusing, since nothing on screen indicated why. Every action control is gated on this,
  // matching the status pill that already shows the (previously ignored) real state.
  const controlsDisabled = !isConnected;

  return {
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
  };
}
