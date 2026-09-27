# ADR-HEARTH-179: Cut remote-command latency — fewer read-backs, faster dead-hop timeout

**Date:** 2026-09-27
**Status:** Accepted, implemented.
**Verification:** Unit/contract tests with mocked `fetch`/WebSocket only (before/after call counts asserted
directly in each driver's test file); no real TV/receiver/speaker or Family Command Center was available to
measure wall-clock latency against. The `~2.5s` vs `~8s` timeout numbers are exact (they come straight from the
named constants below, not a live measurement); the "N round trips" numbers per command are exact call counts
from the drivers' own code (before) and the updated tests (after). Wall-clock savings from removing a round
trip are described qualitatively (real, not zero) rather than given a specific millisecond figure, since no
live hardware/relay was available this session to time it.

## Context
Sean: the app "lags" controlling TVs. Reading the code (not guessing) turned up three separate causes:

1. **`LgWebOsDriver.ts`** read back `ssap://audio/getVolume` after `setVolume` and `mute`, even though both
   already know the resulting value without asking the TV again (an exact set, and a load-bearing pre-toggle
   read respectively). `volumeUp`/`volumeDown` were not part of this — they already read back correctly, since
   webOS's own response to those doesn't carry the resulting level (confirmed: this driver's own mock-hardware
   tests model the response as `{returnValue: true}` only, no `volume` field).
2. **`SonyBraviaDriver.ts`** called `refreshState()` — a full `getPowerStatus` + `getVolumeInformation` pair —
   after **every** `executeCommand()`, including `directionalNavigation`/`select`/`back`/`home`/`inputSelection`,
   none of which change power or volume at all. `power`/`setVolume`/`mute` already know their exact resulting
   value the same way LG's do; only `volumeUp`/`volumeDown` (Sony's REST API takes a raw relative `+2`/`-2` step,
   and its response carries nothing back) genuinely need the read-back, unchanged.
3. **`src/core/network/fccRequest.ts`'s `fccFetch`** tries the LAN address then the public tunnel address
   sequentially, each up to `DEFAULT_FETCH_TIMEOUT_MS` (8000ms, `fetchWithTimeout.ts`). Every relay-routed
   command (`httpRelayFallback.ts`'s `callRelayThroughFcc`, used by Sony, Roku, Denon, Yamaha, Sonos, Samsung's
   HTTP leg, Home Assistant's relay path, and any brand riding the same relay) goes through this same function
   with an 8000ms budget (`RELAY_TIMEOUT_MS`). Connectivity mode (`fccConnectivity.ts`) only has a real
   freshness guarantee for the "away, LAN failed within the last 5 minutes" case (`AWAY_MEMORY_MS`) — a stale
   "home" mode, or "unknown" at cold start, both try the LAN address first purely as a default assumption, not
   because anything just confirmed it's actually reachable right now. A LAN address that's gone dead (the phone
   just left the house, or Family Command Center is off) paid the full 8s before falling back to a working
   public tunnel — on every such command, and again every time the away-mode memory expires and re-probes.

Also audited per Sean's request, same "read-back after every command" pattern:

- **`SamsungTizenDriver.ts`**: already fully optimistic (the Tizen remote protocol has no query method at all —
  see the driver's own top-of-file comment). No change.
- **`RokuEcpDriver.ts`**: `volumeUp`/`volumeDown`/`mute`/`channelUp`/`channelDown`/`back`/`home`/`directionalNavigation`
  already patch state optimistically with no read at all. `powerOff` reads back once (needed — ECP has no
  power-on, so "did it actually turn off" is the only signal). `selectPlayPause`'s read-back is explicitly
  load-bearing (ADR-HEARTH-116: its result decides whether the *next* press sends Select or Play). No change.
- **`DenonDriver.ts`**: same shape as Sony/LG — `power`/`mute` already pre-read to compute the toggle,
  `setVolume` sends an exact value; all three paid a redundant `refreshState()` afterward. `volumeUp`/`volumeDown`
  send a raw relative dB step (`VOLUME_STEP_DB`) with no response value — kept, same reasoning as Sony's.
- **`YamahaMusicCastDriver.ts`**: every capability (`power`, `volumeUp`, `volumeDown`, `setVolume`, `mute`,
  `inputSelection`) already reads current status first and computes an absolute target client-side (unlike
  Sony/Denon's raw relative delta) before sending an exact `setVolume`/`setPower`/`setMute`/`setInput` call — so
  *every* command here could drop its trailing `refreshState()`, not just the exact-set ones.
- **`SonosDriver.ts`**: same shape as Yamaha (`volumeUp`/`volumeDown` read-then-clamp-then-set an absolute value,
  `mute`/`playPause` read-then-toggle) — every command could drop the trailing `refreshState()`. Sonos's
  `refreshState()` is the most expensive of any driver in this audit: three separate UPnP SOAP calls
  (`getVolume`, `getMute`, `getTransportState`) run in parallel, not one combined call.
- **`HomeAssistantDriver.ts`**: **left unchanged.** It already has a genuine periodic poll
  (`HOME_ASSISTANT_POLL_INTERVAL_MS`, 10s, only while a listener is subscribed) as well as a single-call
  `refresh()` after each command (one `GET /api/states/<entity>`, not two-in-parallel like Sony/Denon/Yamaha/
  Sonos). Home Assistant's `POST /api/services/...` response does carry the changed entity states, which could
  in principle replace this GET — but `HomeAssistantClient.callService()` doesn't parse or expose that response
  today, and doing so would mean trusting an unverified response schema for entities this driver hasn't audited
  field-by-field the way `haEntityMapping.ts` audits `GET /api/states`. Given the existing poll already limits
  how stale this ever gets, and the per-command cost is already one call (not two or three), this was judged
  not worth the schema risk for this pass — flagged here rather than silently left for a future ADR to pick up.
- **`wsRelayFallback.ts`** (LG/Samsung's WebSocket relay, `RELAY_CONNECT_TIMEOUT_MS`): a structurally similar
  LAN-then-public sequence, but a separate file/protocol from `fccRequest.ts` and not in Sean's named list of
  affected devices (Sony, Roku, Vizio, Wiz, LIFX, Shelly, Android TV, Home Assistant relay path — all HTTP-relay
  brands). Left alone; the same idea could apply there in a follow-up ADR.

## Decision

### (a) Skip a read-back only where the result is already known; never guess a relative step
For every driver above, a command now returns/applies the state it can already prove instead of reading it
back over the network, using one of two load-bearing reads that already existed (never removed just to save a
call — removing them would be a correctness regression, not a latency fix):

- **An exact `set`** (`setVolume`, and any driver's `power`/`mute` toggle computed from a pre-read of the
  *current* value) — the value just sent **is** the new state. Patched optimistically, no read-back.
- **A relative step with no resulting value in the response** (Sony's/Denon's raw `+2`/`-0.5` delta) — kept
  exactly as before: still reads back for real, because nothing else tells us the resulting absolute level.
- **A pre-toggle read already required to decide what to send** (mute needs to know the current value to send
  the opposite; power needs to know current status to send the opposite) is not a new network cost — it already
  existed. It's simply reused for the patch instead of being followed by a second, redundant read of the same
  value.
- **Commands that don't touch power/volume at all** (Sony's `inputSelection`/`directionalNavigation`/`select`/
  `back`/`home`) no longer trigger a same full state refresh that was never actually about them.
- **LG's connection heartbeat** (`startConnectionHeartbeat`, `HEARTBEAT_INTERVAL_MS` = 8s) already calls
  `ssap://audio/getVolume` every cycle for liveness and used to discard the response. It now feeds that same
  response into cached state (`probeAndSyncVolume`) — the "periodic poll that corrects drift" `setVolume`/`mute`
  now rely on, at zero extra network cost (the call was already happening).
- Nothing that can't be safely inferred was guessed: **volumeUp/volumeDown keep their real read-back on every
  driver that sends a raw relative delta** (Sony, Denon) — LG's own test suite already models the TV's real
  `volumeUp` response as carrying no volume field, and Sony has an explicit correctness test ("reports the
  actual resulting volume, not an assumed one") that was left untouched, not weakened.

### (a.1) Restoring the disconnect-race guard the removed `refreshState()` calls used to carry
`refreshState()` (Sony/Denon/Yamaha/Sonos) always compared a generation number captured before its
own network call against the current one before committing state — so an explicit `disconnect()`
racing with an in-flight command's read/write would win, instead of that command's late-arriving
result resurrecting a device the user just disconnected. Skipping `refreshState()` for the commands
in (a) would have silently dropped that guard. Each driver's new `markConnected()` restores it
explicitly: `executeCommand` captures `generation` before `applyCommand`'s own await, and
`markConnected` only writes to cached state (and clears any pending reconnect) if the generation is
still current, always returning a truthful `CommandResult` either way. Proven by a dedicated test
per driver using a manually-resolved (deferred) `fetch` promise, so the race is deterministic rather
than timing-dependent.

### (b) `fccFetch`'s LAN hop gets a short timeout — but only when it's safe to
`src/core/network/fccRequest.ts`: a new `LAN_FIRST_HOP_TIMEOUT_MS` (2500ms) applies **only** to an attempt where
`route === "lan"` **and** it is not the last attempt in the ordering. Concretely:

- **LAN attempted with a public fallback configured and untried after it** (the common "just left home," or
  "unknown at cold start" case): 2500ms, not 8000ms. A real, working LAN response is fast (sub-second on a home
  network) — 2.5s is generous headroom for that case while failing a genuinely dead LAN hop far sooner.
- **The public hop always keeps the full requested budget** — never shortened, whether it's the fallback (LAN
  just failed) or the confirmed-preferred route while away (`shouldPreferPublicRoute()`). This is the hop that
  must not be starved: a slower-but-working Cloudflare Tunnel round trip must not become a false failure.
- **A LAN-only config (no `publicBaseUrl` set)** keeps its full requested budget unchanged — there's nothing to
  fall back to, so shortening it would only turn a slow-but-working request into a false failure with no
  upside. This was the specific risk Sean flagged ("do not blindly shorten both") and is proven by a dedicated
  test (`fccRequest.test.ts`).
- The LAN-then-public *policy* itself (ADR-HEARTH-147) is unchanged — only the per-hop timeout budget.
- `httpRelayFallback.ts`'s own `DIRECT_TIMEOUT_MS`/`RELAY_TIMEOUT_MS` (4000ms/8000ms — the direct-to-device leg
  and the overall budget handed to `fccFetch` for the relay leg) are unchanged; the new short LAN-hop budget
  applies *inside* that 8000ms relay-leg budget, not instead of it.

## Round-trip counts, before → after (exact, from code + tests)

| Driver | Command | Before | After |
|---|---|---|---|
| LG | `setVolume` | 2 (`setVolume` + `getVolume`) | 1 |
| LG | `mute` | 3 (`getVolume` + `setMute` + `getVolume`) | 2 |
| LG | `volumeUp`/`volumeDown` | 2 | 2 (unchanged — real read-back kept) |
| Sony | `power` | 4 (`getPowerStatus` + `setPowerStatus` + refreshState's 2-parallel) | 2 |
| Sony | `mute` | 4 (`getVolumeInformation` + `setAudioMute` + refreshState's 2-parallel) | 2 |
| Sony | `setVolume` | 3 (`setAudioVolume` + refreshState's 2-parallel) | 1 |
| Sony | `inputSelection`/`directionalNavigation`/`select`/`back`/`home` | 3 (command + refreshState's 2-parallel) | 1 |
| Sony | `volumeUp`/`volumeDown` | 3 | 3 (unchanged — real read-back kept, correctness test enforces this) |
| Denon | `power`/`mute` | 3 | 2 |
| Denon | `setVolume` | 2 | 1 |
| Denon | `volumeUp`/`volumeDown` | 2 | 2 (unchanged) |
| Yamaha | `power`/`volumeUp`/`volumeDown`/`mute` | 3 | 2 |
| Yamaha | `setVolume`/`inputSelection` | 2 | 1 |
| Sonos | `volumeUp`/`volumeDown`/`mute`/`playPause` | 5 (pre-read/command + refreshState's 3-parallel) | 2 |
| Sonos | `setVolume` | 4 | 1 |

Every "after" figure above is enforced by an explicit `toHaveBeenCalledTimes(...)` assertion in that driver's
test file, not just an unasserted side effect of the refactor.

## Timeout budget, before → after

| Scenario | Before | After |
|---|---|---|
| LAN hop, public tunnel configured, not the last attempt | 8000ms | 2500ms |
| Public hop (fallback or preferred) | 8000ms | 8000ms (unchanged) |
| LAN-only config (no public tunnel) | 8000ms | 8000ms (unchanged) |

Worst case for the specific bug reported ("a bad first hop eats up to 8s"): a dead LAN hop with a working
public hop now resolves in roughly `2.5s + (public round trip)` instead of `8s + (public round trip)` — proven
by `fccRequest.test.ts`'s fake-timer test, which advances exactly to 2499ms (still pending) and then 2ms further
(resolves), rather than needing the full 8000ms window.

## Consequences
- Every navigation/select/back/home/input press on Sony now costs one REST call instead of three — the single
  largest cut, since these are the most frequently pressed buttons and previously paid for a power+volume
  refresh that was never about them.
- Drift protection is preserved, not removed: LG's heartbeat already probes `getVolume` every 8s regardless and
  now also corrects state from it; every other driver's own next real interaction (or, for Sonos/Yamaha, the
  next `connect()`) still re-syncs from a live read. Home Assistant's existing 10s poll is untouched.
- No driver was made to guess a value it couldn't already prove — `volumeUp`/`volumeDown`'s real read-back
  survives everywhere the underlying protocol sends a raw relative delta (Sony, Denon), and Sony's own
  correctness test proving this ("not an assumed one") was left in place, not weakened.
- A household without Family Command Center's public tunnel configured (ADR-HEARTH-123) sees no change at all
  in `fccFetch`'s timeout behavior — the short-LAN-timeout logic only ever engages when there's a real fallback
  to catch it.
- `wsRelayFallback.ts` (LG/Samsung's WS relay) and `HomeAssistantDriver.ts`'s per-command refresh were
  deliberately left alone this pass — flagged above with the specific reason each was skipped, not silently
  dropped.

## Verification
- `npx tsc --noEmit`: clean.
- `npx jest --silent --testPathIgnorePatterns="node_modules"`: 1387 passed, 18 skipped, one pre-existing failure
  in `runner/shims/shims.test.ts` (a `ws`/`WebSocketServer` constructor issue in the Node test-runner shim,
  unrelated to this change — explicitly out of scope per this session's own instructions).
- `src/drivers/driverContract.test.ts` (the cross-driver contract suite) and `src/drivers/contract/relayRecovery.test.ts`:
  both pass unmodified.
- Every touched driver's test file was updated to assert the new call counts directly (see table above) rather
  than merely not-breaking on stale mocks.
