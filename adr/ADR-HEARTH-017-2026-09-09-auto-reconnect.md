# ADR-HEARTH-017: Automatic reconnection across all four drivers

**Date:** 2026-09-09
**Status:** Accepted

## Context

Sean, directly, after the manual "Reconnect" button was added:
"once the remote is connected it should never lose connection" and,
pressed on scope, "anything that ever gets connect[ed]... the same way
wifi works where when you only connect once, you never have to reconnect
[manually]."

A dropped connection can't be literally prevented — a router hiccup, a TV
going to standby, a relay restart, or a device briefly going offline are
all real, external events no client-side code controls. What's achievable,
and what Sean's WiFi comparison actually describes, is that the *user*
never has to notice or act: a drop should self-heal in the background.

Before this, only a manual "Reconnect" button existed (this same session,
immediately prior). Two real gaps stood in the way of the actual ask:
1. LG/Samsung's persistent WebSocket had no listener at all for an
   unexpected close — a drop just sat as "disconnected" forever.
2. Sony/Roku's HTTP-based drivers have no persistent connection to drop,
   but the identical failure mode exists in a different shape: if a state
   refresh or command fails once, nothing ever retried on its own — and
   the same session's UI change to disable controls while disconnected
   (`UniversalTvRemote.tsx`) means a user can't even trigger a retry by
   pressing a button once that state is stuck.

## Decision

All four drivers now auto-retry with the same shared shape: exponential
backoff starting at 2s, capped at 30s between attempts, retried
indefinitely (never gives up on its own) until the device is reachable
again or the user explicitly disconnects it.

- **LgWebOsClient / SamsungTizenClient**: gained an `onDisconnect`
  callback, fired when the main socket closes *after* a successful
  connect (not during the handshake — that's still the existing
  reject path) and *not* from a deliberate `close()` call (tracked via a
  `closingDeliberately` flag, set only inside `close()` itself). A stale
  socket's late close event is guarded against by checking
  `this.socket === socket` before acting — a newer connection may have
  already replaced it.
- **LgWebOsDriver / SamsungTizenDriver**: wire `client.onDisconnect` to a
  `handleUnexpectedDisconnect` method that marks state `"disconnected"`
  and schedules a backoff retry calling `connect()` again (which creates
  a fresh client and re-attaches the hook).
- **SonyBraviaDriver**: no persistent socket, so the trigger is any
  failure inside `refreshState()` — called both by `connect()` and after
  every command. A retry is scheduled on failure and cleared on the next
  success, whichever call site reaches it first.
- **RokuEcpDriver**: same shape — `connect()` and `executeCommand()` both
  schedule a retry on failure, guarded so a second failure while one is
  already scheduled doesn't stack a duplicate timer.
- `disconnect()` on every driver clears any pending reconnect timer —
  removing a device (or the user's own explicit disconnect) must not
  leave a zombie retry loop running.

The already-shipped manual "Reconnect" button (`UniversalTvRemote.tsx`)
stays — a way to force an immediate retry rather than wait out the current
backoff interval, not replaced by this.

## Rationale

Retrying indefinitely rather than giving up after N attempts matches the
actual ask: a device that's been unreachable for an hour should still
reconnect the moment it's back, the same way a phone doesn't stop trying
to rejoin a WiFi network after a fixed number of attempts. The 30s cap
keeps a long-dead device from being hammered at full speed forever, while
still checking often enough that "it just works again" reads as
near-immediate once the device is actually back.

Putting the Sony/HTTP retry trigger in `refreshState()` rather than only
in `connect()` was a deliberate correction mid-implementation: a first
pass only retried on the initial connect failure, missing the more common
case of a device dropping out *during* normal use.

## Consequences

- 93/93 tests passing (2 new: LG's real disconnect→auto-reconnect round
  trip, and confirming a deliberate `disconnect()` does *not* trigger one).
  Real timers used deliberately for the reconnect tests (same tradeoff as
  `setChannel`'s tests) — fake-timer/event-dispatch interaction proved
  unreliable earlier this session; a real ~2s wait is slower but correct.
- Every driver now holds a `reconnectTimers` map keyed by device id — a
  small, deliberate bit of state duplication across four files rather than
  a shared base class, matching this project's existing pattern of keeping
  drivers independent (see `addDeviceFormStyles.ts`'s equivalent reasoning
  for the four `AddXDeviceScreen`s).
- Not yet verified against real hardware dropping and recovering — the
  existing mock-driven tests prove the mechanism; a real TV going to
  standby and waking back up, or a relay restart, is the next real
  checkpoint once device testing resumes.

## Update 2026-09-09 (same night): the app-background gap, and easier reconnect

Sean, pressed further: "make sure that nothing ever gets unconnected like
a device on wifi." One real gap remained: iOS can suspend or kill a
backgrounded app's WebSocket connections outright, and nothing was
checking connection state when Hearth came back to the foreground — a
phone doesn't wait out a WiFi retry timer after you unlock it, it
reconnects the moment you're back, and Hearth didn't do the equivalent.

Fixed in `App.tsx`: an `AppState` listener now triggers a reconnect
attempt for every known device the instant the app transitions from
background/inactive to active, regardless of where any individual
driver's own backoff timer happened to be. The existing per-device startup
logic was refactored into a shared `reconnectAllDevices()` helper so both
call sites (initial load, foreground resume) share one implementation
rather than duplicating it.

Second, smaller gap, same request: "make sure it is easier to connect" —
the manual Reconnect button required noticing a device was disconnected
and tapping it. `UniversalTvRemote` now attempts a reconnect automatically
the instant its screen opens for a disconnected device, rather than
waiting for the user to notice and act. The manual button stays for a
still-failing case.

93/93 tests still passing; `tsc --noEmit` clean.

## Update 2026-09-09 (later still): the actual TV confirmed a fourth race, live

While Sean was testing for real, Family Command Center independently traced
a live failure in their relay's own logs, with real timestamps: a second
WebSocket connection attempt to the LG TV started 3 seconds after a first
one, *while the first was still open* — and the TV's SSAP socket didn't
reject the second attempt, it just never responded to it at all, hanging
until the relay's 10-second timeout killed it. The real symptom Sean saw:
"Timed out relaying to wss://10.20.30.40:3001 through Family Command
Center." Family Command Center flagged the same hypothesis independently:
Hearth's own reconnect triggers (startup, `AppState` foreground resume,
opening the remote screen) can call `connect()` for the same device close
enough together to race.

The generation counter added earlier cleans up a redundant attempt's
*result* after the fact — it never stopped the redundant attempt from
being opened in the first place, which is exactly what this real TV
can't tolerate. Fixed with a single in-flight promise per device, all
four drivers: a second `connect()` call for a device already connecting
now awaits the same in-progress attempt instead of starting a doomed
second one. New test proves two concurrent `connect()` calls open exactly
one socket, not two, and both resolve successfully off that one attempt.
96/96 tests passing, `tsc --noEmit` clean.

This is the kind of bug that specifically requires real hardware to
surface — nothing about it is visible from mocks alone, since the mock
WebSocket has no reason to hang on a second connection the way this
specific TV's real firmware does. Confirmed independently by two sessions
tracing the same live symptom from different sides (the relay's server log
and Hearth's own reconnect logic) rather than either one guessing.

## Update 2026-09-09 (same night, later still): three real races found by a deliberate second review

Given the reconnect logic above is exactly the class of thing that's type-safe
and test-passing while still wrong at runtime — the same shape as two real
bugs already caught live earlier tonight — a dedicated review pass was
run specifically hunting for a third one, rather than assuming the first
implementation was correct because it compiled.

**Finding 1 (confirmed live, not hypothetical):** `RokuEcpDriver`'s
`executeCommand` catch couldn't distinguish a genuine network failure from
`applyCommand`'s own argument-validation throws (a bad `direction`,
`channel`, or `input`). A malformed command was marking a fully healthy
Roku "disconnected" and starting an indefinite reconnect loop against a
device that never actually dropped. This is exactly what happened during
the review's own baseline `jest` run — the suite reported passing, but
logged reconnect warnings afterward and one "Cannot log after tests are
done" from real timers still running past test completion. Fixed with a
`RokuValidationError` class: only network/transport failures (thrown from
`RokuEcpClient` calls) trigger the disconnect+reconnect path now; a bad
argument just rejects, state untouched. New test confirms three different
bad-argument calls leave the device "connected" and never re-invoke `fetch`.

**Finding 2 (traced, real):** none of the four drivers' `disconnect()`
could actually stop a reconnect attempt whose `setTimeout` had already
fired and was mid-`connect()`/`refreshState()` — `clearTimeout` only
cancels a timer that hasn't run yet. A device removed while its own
scheduled retry was awaiting a handshake could have that stale attempt
resolve afterward and resurrect it as "connected."

**Finding 3 (traced, real, LG/Samsung only):** worse for the two
persistent-socket drivers — a *successfully* connected client's
`onDisconnect` hook stayed wired even after a newer `connect()` call
superseded it (e.g. two independent triggers — the app-foreground
listener and opening the remote screen — racing for the same device). If
that now-orphaned socket later closed for a real, unrelated reason, it
would still fire `handleUnexpectedDisconnect` and kill the *new*, healthy
connection.

**Fix, all four drivers:** a per-device generation counter.
- LG/Samsung (persistent socket): bumped on every `connect()` call *and*
  every `disconnect()`; checked immediately after the handshake completes
  — a stale generation means abandon cleanly (`client.close()`, no
  `clients`/state write) rather than proceed. `onDisconnect` is additionally
  guarded by identity (`this.clients.get(id) === client`) so a superseded-
  but-still-open client's own eventual close can never act on behalf of
  whatever replaced it. A genuinely superseded previous client is now
  explicitly closed when replaced, rather than left orphaned.
- Sony/Roku (no persistent client to guard by identity — confirmed via
  trace, not assumed): generation bumped only in `disconnect()`, checked
  before `refreshState()`/`connect()` write state on either their success
  or failure path.

New test (`LgWebOsDriver.test.ts`) drives the exact sequence Finding 2/3
described — drop, auto-reconnect scheduled, `disconnect()` called while
the retry is mid-handshake, then the stale handshake completes — and
confirms state stays "disconnected" and the stale client was never
registered. 95/95 tests passing (2 new), `tsc --noEmit` clean, and the
earlier "worker process failed to exit gracefully" / leaked-timer warning
from `jest` is gone now that Finding 1's spurious reconnect loop can't fire.

## Update 2026-09-09 (same night, later still): the identical race one layer down, in the pointer socket

The in-flight-promise dedupe above fixed `connect()` itself, but
`LgWebOsClient.getPointerSocket()` had the exact same "check, then create
if missing" shape, one level lower: it's called on every single d-pad tap,
digit press, and back/home/menu press via `sendButton()`. Two rapid button
presses before the first `getPointerInputSocket` round trip resolves would
each see no pointer socket yet and independently request+open a second
one — hitting the identical hang-instead-of-reject behavior on the real TV
that the driver-level fix addressed, just triggered by fast button-mashing
instead of overlapping reconnect triggers.

Fixed with the same pattern: `pointerSocketPromise` field on
`LgWebOsClient`, `getPointerSocket()` reduced to a thin dedupe wrapper
(open socket → return it; in-flight request → share it; otherwise start
one), original logic moved to a private `openPointerSocket()`. New test
(`LgWebOsClient.test.ts`) fires two `sendButton()` calls back to back
without awaiting the first, confirms only one
`getPointerInputSocket` request goes out and only one pointer-socket
`WebSocket` is constructed, and both button presses land on that one
socket in order. 97/97 tests passing (1 new), `tsc --noEmit` clean.
