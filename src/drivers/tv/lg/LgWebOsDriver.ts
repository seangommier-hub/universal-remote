import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId, NavigationDirection, StreamingService } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState, PlaybackState } from "../../../core/types/DeviceState";
import { logger } from "../../../core/logging/logger";
import { LgWebOsClient, LgWebOsConfig } from "./LgWebOsClient";
import { sendDigitSequence } from "../../../core/util/sendDigitSequence";
import { findCurrentIpByMac, findCurrentIpByName, findMacByIp } from "../../../discovery/familyCommandCenterDeviceLookup";

const LOG_SCOPE = "LgWebOsDriver";
export const LG_WEBOS_DRIVER_ID = "lg-webos-wss3001";

// Only "powerOff" is declared, not "power" — LG's WebSocket protocol has no documented way to
// turn a TV ON (only ssap://system/turnOff exists; waking one requires Wake-on-LAN, which is a
// separate, unimplemented mechanism). See ADR-HEARTH-006.
//
// inputSelection is now implemented (real-hardware ask, 2026-09-10: "there also needs to be an
// input button") via ssap://tv/getExternalInputList + ssap://tv/switchInput, both confirmed
// against hobbyquaker/lgtv2 (this driver's existing reference). Unlike Roku/Sony's fixed
// hdmi1/hdmi2/hdmi3 buttons, LG's actual input ids and labels vary per TV/config and aren't
// knowable in advance — read live off the TV after connecting (refreshInputList below) and
// exposed as `state.values.inputs`, not hardcoded. The exact response field names couldn't be
// pinned down to one authoritative source (community references disagree between `devices[].id`
// and `devices[].appId`) — refreshInputList checks both rather than assuming one.
const LG_CAPABILITIES: CapabilityId[] = [
  "powerOff",
  "volumeUp",
  "volumeDown",
  "setVolume",
  "mute",
  "channelUp",
  "channelDown",
  "directionalNavigation",
  "select",
  "back",
  "home",
  "menu",
  "setChannel",
  "launchApp",
  "inputSelection",
  // Real-hardware research (2026-09-12, ADR-HEARTH-051): ssap://media.controls/play and
  // .../pause, plus a subscribable ssap://com.webos.media/getForegroundAppInfo (live playState
  // pushes) — both documented directly in hobbyquaker/lgtv2, this driver's existing primary
  // reference for every other ssap:// URI it uses. See Capability.ts's playPause entry for the
  // full citation, including the known firmware caveat (some older webOS versions 404 this
  // subscription) — handled the same best-effort way as this driver's other inferred fields.
  "playPause",
];

// See Capability.ts's playPause entry. "playing"/"paused" map directly off the TV's own
// `playState` field; anything else (starting, loaded, no foreground media, or a firmware that
// doesn't support the subscription at all) collapses to "stopped" — same deliberately-coarse
// treatment as RokuEcpDriver's own normalizer.
function normalizePlaybackState(rawState: string | undefined): PlaybackState {
  if (rawState === "playing") return "playing";
  if (rawState === "paused") return "paused";
  return "stopped";
}

const DIRECTION_BUTTONS: Record<NavigationDirection, string> = {
  up: "UP",
  down: "DOWN",
  left: "LEFT",
  right: "RIGHT",
};

// Real webOS app IDs — confirmed 2026-09-10. "netflix" and "youtube.leanback.v4" are documented
// directly in hobbyquaker/lgtv2 (the reference implementation this driver already cites); "amazon"
// and "hulu" are corroborated across multiple independent community sources (Home Assistant's LG
// integration, RTI's commercial driver notes) but not in that primary reference itself — flagged
// here in case a specific TV model turns out to use a different id for either.
const LG_APP_IDS: Record<StreamingService, string> = {
  netflix: "netflix",
  hulu: "hulu",
  primeVideo: "amazon",
  youtube: "youtube.leanback.v4",
};

function requireConfig(device: Device): LgWebOsConfig {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string") {
    throw new Error(`Device ${device.id} is missing LG config (config.ipAddress) — pair it first`);
  }
  const clientKey = device.config?.clientKey;
  return { ipAddress, clientKey: typeof clientKey === "string" ? clientKey : undefined };
}

/**
 * Driver for LG webOS TVs over the community SSAP WebSocket protocol, encrypted port
 * (wss://<ip>:3001) — per ADR-HEARTH-006/014, TVs from roughly 2023 onward (confirmed against
 * Sean's real TV) only accept this port, not the unencrypted ws://3000 this driver used
 * originally. React Native's WebSocket can't trust LG's private-CA certificate directly, so
 * `LgWebOsClient` always connects through Family Command Center's relay (ADR-HEARTH-011/014),
 * which does the actual TLS connection server-side where certificate trust is configurable.
 *
 * Volume/mute state is read back from the TV after each command (ssap://audio/getVolume) using
 * inferred field names (`volume`, `mute`) — LG's official docs for this reverse-engineered
 * protocol don't publish a payload schema, so these are best-effort and degrade to `undefined`
 * rather than crash if wrong. Power and nav/menu state are optimistic (no verified read-back).
 */
// Real-hardware ask (2026-09-09), Sean directly: "once the remote is connected it should never
// lose connection." A dropped WebSocket can't literally be prevented (router hiccups, the TV
// going to standby, a relay restart), but the drop can be made invisible: retry automatically,
// with backoff, until it's back — rather than surfacing a permanently "disconnected" device that
// waits on a human to notice and tap something. Capped at 30s between attempts so this settles
// into a low-noise background retry rather than hammering the relay/TV forever at full speed.
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;

// Real-hardware finding (2026-09-12, live against Sean's actual TV — a 2020 LG 75UN7370PUE,
// webOS ~5.0): ssap://com.webos.media/getForegroundAppInfo (the live subscription above) 404s on
// this firmware — confirmed directly, not inferred. A polling fallback against the older
// ssap://com.webos.applicationManager/getForegroundAppInfo (foreground app id only, no real
// playState) was tried and then reverted the same night, per Sean directly: "the play pause center
// button should only be during the time content is playing but should be a selection button
// otherwise. in the current state nothing can be selected." Treating "a known streaming app is
// merely foregrounded" as "playing" was wrong far more often than right — Netflix/YouTube/etc. stay
// foregrounded the whole time a user is just browsing their menus, not actually playing anything,
// which meant Select (the far more frequently needed function) was hidden almost permanently on
// this TV. No reliable middle ground exists with only an app-id signal available: leaving
// playbackState unset on subscription failure (Select always shown, the original, safe default) is
// strictly more correct than guessing wrong most of the time. Play/pause simply isn't available on
// this firmware without the real subscription — an accepted hardware limitation, not a gap to
// paper over with a worse heuristic.

export class LgWebOsDriver implements DeviceDriver {
  id = LG_WEBOS_DRIVER_ID;
  displayName = "LG webOS TV (WebSocket, encrypted via relay)";

  private clients = new Map<string, LgWebOsClient>();
  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Real-hardware finding (2026-09-09), traced during a same-night review (not yet reproduced
  // live, but the sequence is concrete): connect() can now be triggered from several independent
  // places (startup, AppState foreground resume, opening the remote screen, a scheduled
  // reconnect) — nothing stopped two calls for the same device from racing. Two problems that
  // created: (1) if disconnect() ran while an older connect() was still awaiting its handshake,
  // that attempt could still resolve afterward and resurrect a "removed" device's client/state;
  // (2) a successful-but-since-superseded client's own onDisconnect hook stayed wired, so its
  // eventual (real) close would kill a perfectly healthy newer connection. A generation counter
  // per device, bumped on every connect()/disconnect() and checked after every await before any
  // client/state write, closes both — a stale attempt's writes are silently dropped, and its
  // socket is explicitly closed rather than left orphaned.
  private generations = new Map<string, number>();
  // Real-hardware finding (2026-09-09), confirmed live via Family Command Center's relay logs
  // with real timestamps: the TV's SSAP socket doesn't reject a second simultaneous connection
  // attempt — it just never responds to it, hanging until the relay's own timeout kills it
  // ("Timed out relaying..."), even while the first connection stays healthy and ESTABLISHED.
  // The generation counter above cleans up a redundant attempt's *result* after the fact; it
  // never stopped the redundant attempt from being made in the first place — and multiple
  // independent triggers now call connect() for the same device (startup, AppState foreground
  // resume, opening the remote screen), so two easily land close enough together to race. A
  // single in-flight promise per device means a second call while one is already connecting
  // just waits on the first instead of opening a doomed second socket.
  private inFlightConnects = new Map<string, Promise<void>>();
  // Real-hardware finding (2026-09-10), Sean directly, twice: "it needs to never ever again
  // disconnect." The backoff loop above only ever covered a connection that dropped *after*
  // succeeding (client.onDisconnect) — a connect() that fails outright (the exact case that kept
  // happening while troubleshooting his 75" LG TV's pairing) just threw the error and gave up,
  // with nothing scheduling another try. Tracked here (reset on success) so the very first
  // failure and every subsequent automatic retry share one persistent backoff count, instead of
  // every retry restarting at attempt 1.
  private reconnectAttempts = new Map<string, number>();
  // Real-hardware research (2026-09-12, ADR-HEARTH-051): one live playback-state subscription per
  // device, opened on the current client right after connect(). Tracked so a reconnect/disconnect
  // can tear down the old one before it's replaced — mirrors how `clients` itself is swapped out,
  // just for a subscription instead of the whole socket.
  private playbackUnsubscribes = new Map<string, () => void>();
  // Command-history-derived approximation of "is a video actually playing" (2026-09-13) — see the
  // "select"/"launchApp"/"inputSelection" cases in applyCommand for the actual state machine.
  // Cleared on disconnect() below — a stale assumption from a dropped connection shouldn't survive
  // a reconnect.
  private assumedInStreamingApp = new Map<string, boolean>();

  private bumpGeneration(deviceId: string): number {
    const next = (this.generations.get(deviceId) ?? 0) + 1;
    this.generations.set(deviceId, next);
    return next;
  }

  private isCurrentGeneration(deviceId: string, generation: number): boolean {
    return this.generations.get(deviceId) === generation;
  }

  getCapabilities(): CapabilityId[] {
    return LG_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    const existing = this.inFlightConnects.get(device.id);
    if (existing) return existing;
    const attempt = this.doConnect(device);
    this.inFlightConnects.set(device.id, attempt);
    try {
      await attempt;
      this.reconnectAttempts.delete(device.id); // a fresh failure later starts the backoff over, not mid-escalation
    } catch (err) {
      // Real-hardware finding (2026-09-10): this used to just throw here, with nothing scheduling
      // another try — a device that failed to connect (as opposed to one that connected and then
      // dropped) never got auto-retried at all. One shared path now covers both: the very first
      // failure, a manual "Reconnect" tap that fails, and every automatic retry after it, all
      // through this same catch.
      this.scheduleReconnect(device);
      throw err;
    } finally {
      if (this.inFlightConnects.get(device.id) === attempt) this.inFlightConnects.delete(device.id);
    }
  }

  /**
   * Connects with one specific fallback: on ANY connect failure — not just `LgUnreachableError`
   * (socket never opens) — if this device carries a `hwaddr` (only true for devices added via
   * Family Command Center discovery), checks whether the Center currently sees that MAC at a
   * *different* IP than the one saved.
   *
   * Real-hardware finding (2026-09-10), live during a "reconnect still isn't working" report:
   * originally this only fired on `LgUnreachableError`, on the assumption a stale IP always means
   * "nothing answers there anymore." Live logs proved that assumption wrong — a saved-but-now-wrong
   * IP can have something else answer the WebSocket handshake (DHCP handed the freed address to a
   * different device once the TV moved off it), which produces a normal pairing-timeout failure,
   * not `LgUnreachableError`. That failure mode was invisible to this recovery path, so the driver
   * kept retrying the same wrong IP forever instead of ever checking whether the TV had moved.
   * Broadened to attempt re-discovery on any failure — safe to try unconditionally (same reasoning
   * already applied to `HueLightDriver`'s equivalent recovery): if the MAC lookup returns the same
   * IP already configured (the TV genuinely is still there and genuinely did forget its pairing),
   * nothing changes and the original, correctly-worded error still surfaces unchanged.
   *
   * Only retries once with the corrected address — a second real failure propagates normally into
   * the caller's own backoff loop.
   */
  private async connectClient(device: Device, config: LgWebOsConfig): Promise<{ client: LgWebOsClient; clientKey: string | undefined }> {
    const client = new LgWebOsClient(config);
    try {
      const clientKey = await client.connect();
      return { client, clientKey };
    } catch (err) {
      const hwaddr = device.config?.hwaddr;
      logger.warn(LOG_SCOPE, `${device.name} failed to connect at ${config.ipAddress} — checking Family Command Center for its current address`);
      // Real-hardware finding (2026-09-10), live during a "reconnect still isn't working" report:
      // a device discovered before this driver started saving `hwaddr` (ADR-HEARTH-017) has no MAC
      // on file and can never be re-located by findCurrentIpByMac, no matter how broadly this catch
      // reacts to failure types — there's nothing to look up. Falls back to a hostname match on
      // this device's own `name`, which discovery already set from the Center's reported hostname
      // for exactly this device — same "safe to try, harmless if nothing matches" contract.
      const freshIp = typeof hwaddr === "string" ? await findCurrentIpByMac(hwaddr) : await findCurrentIpByName(device.name);
      if (!freshIp || freshIp === config.ipAddress) throw err; // nothing better found — surface the original failure
      logger.info(LOG_SCOPE, `${device.name} found at a new address: ${config.ipAddress} -> ${freshIp} — retrying`);
      if (device.config) device.config.ipAddress = freshIp; // persisted the same way a fresh client-key is, in doConnect
      // Backfills the MAC this device was missing, the same way EditDeviceAddressScreen.tsx
      // does for a manually-fixed device — so the *next* time this TV moves, it's re-located by
      // the faster, more precise MAC lookup instead of needing this name-fallback again.
      if (typeof hwaddr !== "string" && device.config) {
        const discoveredMac = await findMacByIp(freshIp);
        if (discoveredMac) device.config.hwaddr = discoveredMac;
      }
      const retryClient = new LgWebOsClient({ ...config, ipAddress: freshIp });
      const clientKey = await retryClient.connect();
      return { client: retryClient, clientKey };
    }
  }

  private async doConnect(device: Device): Promise<void> {
    this.clearReconnectTimer(device.id);
    const generation = this.bumpGeneration(device.id);
    const config = requireConfig(device);
    // Diagnostic (2026-09-10, real-hardware troubleshooting): Sean asked whether a previous
    // pairing approval already exists for this TV — this makes that fact directly visible in the
    // Metro log for the next reconnect attempt, rather than guessing. A known client-key here
    // means the TV should recognize this app silently (no new on-screen prompt); its absence
    // means this is genuinely a first-time pairing, which unavoidably needs one physical approval
    // no matter how this attempt is retried.
    logger.info(LOG_SCOPE, `Connecting to ${device.name} (${config.ipAddress}) — ${config.clientKey ? "using a previously-saved client-key" : "no saved client-key yet, this will need a fresh on-screen approval"}`);
    const { client, clientKey } = await this.connectClient(device, config);
    if (!this.isCurrentGeneration(device.id, generation)) {
      // Superseded while connecting — a disconnect() or a newer connect() call won the race.
      // This attempt's handshake succeeded, but nothing should act on it; close cleanly rather
      // than leaving the socket open and unreferenced.
      client.close();
      return;
    }
    // Real-hardware ask (2026-09-10), Sean directly: "only have to approve one time... forever
    // remembered by the tv." Mutates the same Device object every other call site already holds a
    // reference to (App.tsx's `devices` array, the open remote screen's `screen.device`) rather
    // than routing a new value through the driver interface — cheap and consistent with how this
    // object is already treated as a mutable record elsewhere (device.config in general). Doesn't
    // persist to disk by itself; App.tsx re-saves the device after every successful connect() for
    // exactly this reason (see its own comment at those call sites).
    if (clientKey && device.config) {
      device.config.clientKey = clientKey;
    }
    // Only wired for the still-current attempt, and guarded by identity — if a *later* connect()
    // later replaces this client in `this.clients`, this closure's own comparison goes false, so
    // this specific socket closing for real (its own legitimate future disconnect) can never act
    // on behalf of whatever client has since replaced it.
    client.onDisconnect = () => {
      if (this.clients.get(device.id) !== client) return;
      this.clients.delete(device.id);
      this.playbackUnsubscribes.get(device.id)?.();
      this.playbackUnsubscribes.delete(device.id);
      const current = this.states.get(device.id);
      this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
      this.scheduleReconnect(device);
    };
    const previous = this.clients.get(device.id);
    if (previous && previous !== client) previous.close();
    this.playbackUnsubscribes.get(device.id)?.(); // any subscription on a superseded client — its own socket close already stops the pushes, this just drops the stale closure
    this.playbackUnsubscribes.delete(device.id);
    this.clients.set(device.id, client);
    // Successfully pairing over this socket means the TV is on right now.
    this.setState(device.id, { connection: "connected", values: { power: "on" }, lastUpdated: Date.now() });
    await this.refreshVolumeState(device, client);
    await this.refreshInputList(device, client);
    this.subscribeToPlaybackState(device, client);
  }

  async disconnect(device: Device): Promise<void> {
    this.bumpGeneration(device.id); // invalidates any connect() still in flight for this device
    this.clearReconnectTimer(device.id);
    this.playbackUnsubscribes.get(device.id)?.();
    this.playbackUnsubscribes.delete(device.id);
    this.assumedInStreamingApp.delete(device.id);
    this.clients.get(device.id)?.close();
    this.clients.delete(device.id);
    const current = this.states.get(device.id);
    this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
  }

  /**
   * Schedules the next automatic connect() attempt with exponential backoff — the single path
   * that covers a connection dropping after it succeeded (client.onDisconnect) *and* a connect()
   * that failed outright, including the very first attempt (connect()'s own catch, above). A
   * device already mid-connect-attempt or already awaiting a scheduled retry is left alone (the
   * dedup guard below) rather than stacking a second competing timer.
   */
  private scheduleReconnect(device: Device): void {
    if (this.reconnectTimers.has(device.id)) return;
    const attempt = (this.reconnectAttempts.get(device.id) ?? 0) + 1;
    this.reconnectAttempts.set(device.id, attempt);
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS);
    logger.warn(LOG_SCOPE, `${device.name} not connected — retrying in ${delay / 1000}s (attempt ${attempt})`);
    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(device.id);
      try {
        await this.connect(device);
        logger.info(LOG_SCOPE, `${device.name} reconnected after ${attempt} attempt(s)`);
      } catch (err) {
        // connect()'s own catch already re-scheduled the next attempt — just log this one.
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(LOG_SCOPE, `Reconnect attempt ${attempt} for ${device.name} failed`, { message });
      }
    }, delay);
    this.reconnectTimers.set(device.id, timer);
  }

  private clearReconnectTimer(deviceId: string): void {
    const timer = this.reconnectTimers.get(deviceId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(deviceId);
    }
  }

  async getState(device: Device): Promise<DeviceState> {
    return this.states.get(device.id) ?? { connection: "unknown", values: {}, lastUpdated: Date.now() };
  }

  async executeCommand(device: Device, command: Command): Promise<CommandResult> {
    const client = this.clients.get(device.id);
    if (!client) {
      throw new Error(`Device ${device.id} is not connected — call connect() before sending commands`);
    }

    await this.applyCommand(client, device, command);

    const state = this.states.get(device.id) ?? { connection: "connected", values: {}, lastUpdated: Date.now() };
    return {
      success: true,
      deviceId: device.id,
      capability: command.capability,
      timestamp: Date.now(),
      state: state.values,
    };
  }

  subscribeToState(device: Device, listener: StateChangeListener): () => void {
    const set = this.listeners.get(device.id) ?? new Set<StateChangeListener>();
    set.add(listener);
    this.listeners.set(device.id, set);
    return () => set.delete(listener);
  }

  private async applyCommand(client: LgWebOsClient, device: Device, command: Command): Promise<void> {
    switch (command.capability) {
      case "powerOff":
        await client.call("ssap://system/turnOff");
        this.patchValues(device.id, { power: "off" });
        return;
      case "volumeUp":
        await client.call("ssap://audio/volumeUp");
        await this.refreshVolumeState(device, client);
        return;
      case "volumeDown":
        await client.call("ssap://audio/volumeDown");
        await this.refreshVolumeState(device, client);
        return;
      case "setVolume": {
        const target = command.args?.volume;
        if (typeof target !== "number") throw new Error("setVolume requires a numeric 'volume' arg");
        await client.call("ssap://audio/setVolume", { volume: target });
        await this.refreshVolumeState(device, client);
        return;
      }
      case "mute": {
        const current = await client.call("ssap://audio/getVolume");
        await client.call("ssap://audio/setMute", { mute: !current.mute });
        await this.refreshVolumeState(device, client);
        return;
      }
      case "channelUp":
        await client.call("ssap://tv/channelUp");
        this.patchValues(device.id, { lastAction: "channelUp" });
        return;
      case "channelDown":
        await client.call("ssap://tv/channelDown");
        this.patchValues(device.id, { lastAction: "channelDown" });
        return;
      case "select": {
        await client.sendButton("ENTER");
        // Real-hardware finding (2026-09-13): this TV's firmware has no endpoint that reports
        // true playback state — confirmed live, during Sean's own active viewing, across every
        // plausible SSAP query. Fire TV's remote can dynamically become play/pause because Fire OS
        // has real internal knowledge of its player; this TV genuinely doesn't expose that to any
        // client. Deriving an approximation from OUR OWN command history instead: once a streaming
        // app has been launched (see "launchApp" below) and the user presses Select inside it,
        // that's a real, meaningful signal — selecting a title is how you start playback in every
        // one of these apps — so this specific Select press is the one that flips the center
        // button over to play/pause for whatever comes next. Pressing Home resets it. Not perfect
        // (selecting something that isn't "play this," e.g. a show's detail page, still flips it),
        // but far narrower and more accurate than guessing from foreground-app-id alone, which was
        // wrong the entire time a user was just browsing an app's menus, not just at one moment.
        if (this.assumedInStreamingApp.get(device.id)) {
          this.patchValues(device.id, { playbackState: "playing" });
        } else {
          this.patchValues(device.id, { lastAction: "select" });
        }
        return;
      }
      case "back":
        await client.sendButton("BACK");
        this.patchValues(device.id, { lastAction: "back" });
        return;
      case "home":
        await client.sendButton("HOME");
        // Leaving to the launcher is an unambiguous "not watching anything, not browsing an app
        // either" signal — reset both the streaming-app assumption and the center button.
        this.assumedInStreamingApp.set(device.id, false);
        this.patchValues(device.id, { lastAction: "home", playbackState: "stopped" });
        return;
      case "menu":
        await client.sendButton("MENU");
        this.patchValues(device.id, { lastAction: "menu" });
        return;
      case "setChannel": {
        const channel = command.args?.channel;
        if (typeof channel !== "number") throw new Error("setChannel requires a numeric 'channel' arg");
        // Digit button names are literal "0".."9" — sourced from hobbyquaker/lgtv2's documented
        // button list, sent over the same pointer-input socket as every other button press.
        await sendDigitSequence(channel, (digit) => client.sendButton(digit));
        this.patchValues(device.id, { channel });
        return;
      }
      case "directionalNavigation": {
        const direction = command.args?.direction as NavigationDirection | undefined;
        if (!direction || !(direction in DIRECTION_BUTTONS)) {
          throw new Error("directionalNavigation requires a valid 'direction' arg");
        }
        await client.sendButton(DIRECTION_BUTTONS[direction]);
        this.patchValues(device.id, { lastNavigation: direction });
        return;
      }
      case "launchApp": {
        const service = command.args?.service as StreamingService | undefined;
        const appId = service ? LG_APP_IDS[service] : undefined;
        if (!appId) throw new Error(`launchApp requires a supported 'service' arg (got ${String(service)})`);
        // ssap://system.launcher/launch — sourced from hobbyquaker/lgtv2, same reference this
        // driver already cites for the button list and pairing manifest.
        await client.call("ssap://system.launcher/launch", { id: appId });
        // Fresh app launch always lands on that app's own browse/home screen, never straight into
        // playback — Select stays the center button until a real Select press inside it (see the
        // "select" case above) signals the user actually started watching something.
        this.assumedInStreamingApp.set(device.id, true);
        this.patchValues(device.id, { lastAction: `launch:${service}`, playbackState: "stopped" });
        return;
      }
      case "inputSelection": {
        const input = command.args?.input;
        if (typeof input !== "string") throw new Error("inputSelection requires a string 'input' arg");
        // ssap://tv/switchInput — sourced from hobbyquaker/lgtv2. `input` here is one of the real
        // ids refreshInputList() read off this specific TV, not a guessed/hardcoded value.
        await client.call("ssap://tv/switchInput", { inputId: input });
        // Switching to e.g. an HDMI input leaves whatever app was open — same reset as Home.
        this.assumedInStreamingApp.set(device.id, false);
        this.patchValues(device.id, { input, playbackState: "stopped" });
        return;
      }
      case "playPause": {
        // Unlike Roku's single toggle key, LG's media.controls exposes separate play/pause
        // endpoints (hobbyquaker/lgtv2, same reference as every other ssap:// URI here) — choose
        // based on the last-known real state so the button does the opposite of what's playing
        // now. Defaults to "play" when state isn't known yet (unsubscribed firmware, or nothing
        // pushed yet) — the safer default when genuinely unsure.
        const currentState = this.states.get(device.id)?.values.playbackState;
        const uri = currentState === "playing" ? "ssap://media.controls/pause" : "ssap://media.controls/play";
        await client.call(uri);
        // Optimistic flip for instant UI feedback — the live subscription (where this TV's
        // firmware supports it) corrects this with the TV's own real value moments later
        // regardless, the same "don't block the UI on a read-back" reasoning already used
        // elsewhere (e.g. Samsung's optimisticValuesAfter).
        this.patchValues(device.id, { playbackState: currentState === "playing" ? "paused" : "playing" });
        return;
      }
      default:
        throw new Error(`LgWebOsDriver does not implement capability: ${command.capability}`);
    }
  }

  /**
   * Opens the live playback-state subscription (ADR-HEARTH-051) right after connect, over the
   * same SSAP socket already used for everything else. Best-effort exactly like
   * refreshVolumeState/refreshInputList below: some older webOS firmware 404s this specific
   * subscription (see LG_CAPABILITIES' playPause comment) — a failure here leaves playbackState
   * unset (the UI falls back to the plain Select/checkmark button) rather than failing connect().
   */
  private subscribeToPlaybackState(device: Device, client: LgWebOsClient): void {
    try {
      const unsubscribe = client.subscribe("ssap://com.webos.media/getForegroundAppInfo", (payload) => {
        const apps = Array.isArray(payload.foregroundAppInfo) ? payload.foregroundAppInfo : [];
        const first = apps[0] as Record<string, unknown> | undefined;
        const rawState = first && typeof first.playState === "string" ? first.playState : undefined;
        this.patchValues(device.id, { playbackState: normalizePlaybackState(rawState) });
      });
      this.playbackUnsubscribes.set(device.id, unsubscribe);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(LOG_SCOPE, `Could not subscribe to live playback state for ${device.name}`, { message });
    }
  }

  private async refreshVolumeState(device: Device, client: LgWebOsClient): Promise<void> {
    try {
      const payload = await client.call("ssap://audio/getVolume");
      this.patchValues(device.id, { volume: payload.volume, muted: payload.mute });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(LOG_SCOPE, `Could not read back volume state for ${device.name}`, { message });
    }
  }

  // See LG_CAPABILITIES' comment on inputSelection: real input ids/labels aren't knowable ahead
  // of time, so this reads them live off the TV after every connect and stores them as
  // `state.values.inputs` for the UI to render real buttons from — never a hardcoded HDMI1/2/3
  // guess. Best-effort: a device with no external inputs, or a call this TV rejects, just leaves
  // `inputs` unset rather than failing the whole connect.
  private async refreshInputList(device: Device, client: LgWebOsClient): Promise<void> {
    try {
      const payload = await client.call("ssap://tv/getExternalInputList");
      // Real-device finding (2026-09-10): "inputs not labeled by their actual input" — the UI was
      // silently falling back to the generic hdmi1/2/3 guess with no visible sign the dynamic read
      // had failed. Rather than guess again at field names blind, this logs the exact raw response
      // — since Sean's phone runs through this same Metro instance, its console output reaches
      // this terminal too, so the next real connect() attempt should show, here, precisely what
      // this TV's firmware actually returns instead of what the reference implementation
      // (hobbyquaker/lgtv2) or community sources described.
      logger.info(LOG_SCOPE, `Raw getExternalInputList response for ${device.name}`, { payload });
      const rawDevices = Array.isArray(payload.devices) ? payload.devices : [];
      const inputs = rawDevices
        .map((entry) => {
          const record = entry as Record<string, unknown>;
          const id = typeof record.id === "string" ? record.id : typeof record.appId === "string" ? record.appId : undefined;
          if (!id) return null;
          const label = typeof record.label === "string" ? record.label : id;
          return { id, label };
        })
        .filter((entry): entry is { id: string; label: string } => entry !== null)
        // Sean, directly and repeatedly (2026-09-10, again 2026-09-12): his TV reports "Sling TV" as
        // one of its real inputs but he doesn't use it and wants it gone. Originally filtered only
        // inside UniversalTvRemote.tsx's own render — a real gap found live tonight once a second
        // consumer (CreateSceneScreen, reading state.values.inputs directly for scene-building) hit
        // the same raw, unfiltered list and showed Sling TV again. Filtering here, at the one place
        // this list is actually produced, means every current and future consumer of
        // state.values.inputs agrees, instead of each screen needing its own copy of this filter.
        .filter((entry) => entry.label.trim().toLowerCase() !== "sling tv");
      if (inputs.length > 0) {
        this.patchValues(device.id, { inputs });
      } else {
        logger.warn(LOG_SCOPE, `getExternalInputList returned no parseable inputs for ${device.name} — falling back to the generic hdmi1/2/3 guess`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(LOG_SCOPE, `Could not read input list for ${device.name}`, { message });
    }
  }

  private patchValues(deviceId: string, patch: DeviceState["values"]): void {
    const current = this.states.get(deviceId);
    this.setState(deviceId, {
      connection: "connected",
      values: { ...current?.values, ...patch },
      lastUpdated: Date.now(),
    });
  }

  private setState(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }
}
