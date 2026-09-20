# ADR-HEARTH-099: PS5 wake driver — real protocol turned out simpler than first assumed

**Date:** 2026-09-19
**Status:** Accepted, implemented

## Context

Continuing "work on every driver possible." PS5 was investigated twice in this session, with two
real corrections along the way — both documented here rather than only in chat, since the final
implementation only makes sense in light of what was ruled out first:

1. **First pass**: compared to XboxDriver.ts ("same shape") — wrong. Verified against
   `dhleong/ps4-waker`'s `ps4socket.js`/`packets.js`: PS4/PS5's *full remote-control* session is a
   real encrypted TCP protocol (RSA-2048 key exchange, AES-128-CBC framed packets, port 997) —
   genuinely bigger than Xbox's credential-free broadcast.
2. **Second pass**: verified specifically what *waking* (not full remote control) actually needs,
   against `ktnrg45/pyps4-2ndscreen`'s `credential.py` (the library behind Home Assistant's real
   PS4/PS5 integration) — and it turns out wake needs none of that TCP/RSA/AES session at all. The
   wake credential is obtained once via a passive local-network capture, not minted by pairing:
   - Bind UDP port 987 and answer a `SRCH` probe with a plain `HTTP/1.1 620 Server Standby`
     reply, exactly as a real console in standby would — this makes the phone appear as a
     pairable device inside Sony's own official PlayStation App's device list.
   - When the user taps that entry in the *real* PlayStation App, it sends a real `WAKEUP` DDP
     packet — which carries `client-type`/`auth-type`/`user-credential` in **plain text**. This is
     the same mechanism Home Assistant's own setup docs walk users through; it never touches
     Sony's servers, and Sony's own app is the one broadcasting the credential, not something
     invented locally.
   - After that one-time capture, waking is a single plaintext UDP packet to port 987 with the
     saved credential — no different in shape from Xbox's own broadcast.

No TCP, no RSA/AES anywhere in the implementation. No new native dependency: the existing
`react-native-udp` (already added for SSDP, ADR-HEARTH-095) covers everything.

## Decision

New `src/drivers/gaming/ps5/` (`Ps5Client.ts` — DDP request/response builders + parsers,
`captureCredentials()`/`sendWake()`; `Ps5Driver.ts` — mirrors XboxDriver.ts exactly: `powerOn`
only, no connect()-time probe, credentials trusted as captured). New `AddPs5DeviceScreen.tsx` is
an *interactive* pairing screen (listens live, shows "open the PlayStation App and tap
`<name>`"), not the usual static IP-entry form — deliberately excluded from
`MANUAL_ADD_BRANDS`/discovery brand-matching, since there's no IP-alone path into this driver.

## Consequences

- PS5 owners get a real, working power-on button, with a first-time setup step that's unusual
  (uses Sony's own app briefly) but matches an established, real pattern (same as Home Assistant's
  own PS4/PS5 integration), not a novel hack.
- Same scope limits as Xbox: no power-off, no state query, no media control — a full authenticated
  session would be required and is out of scope.
- Binding UDP port 987 directly on the phone (not via Family Command Center) is unverified on real
  hardware as of this writing — mobile OS sandboxes generally don't enforce the classic Unix
  "privileged port" restriction the way a Linux server does, but this has not yet been confirmed
  live. If it fails, `Ps5Client.captureCredentials` surfaces a clear, real error rather than
  hanging or silently failing.
- Verified: `npx jest src/drivers/gaming/ps5 --silent` (11/11) and full `npx jest --silent` →
  839/839 passing (worktree-duplicated count from an unrelated background task running in
  `.claude/worktrees/`, gitignored, not part of this change — deduplicated, all of this project's
  own tests pass). `npx tsc --noEmit` clean. No new native dependency, so fully OTA-shippable.
- **Not yet verified against a real console** — pending a live test with Sean's actual PS5 and the
  official PlayStation App.

## Addendum (2026-09-19, same day): the phone-direct assumption was wrong — real crash, moved server-side

Live on Sean's iPhone: `Ps5Client.captureCredentials` crashed immediately with "cannot read
createSocket of null". Root cause, confirmed against the library's own known issues and Expo's SDK
57 changelog: **`react-native-udp` doesn't support React Native's "New Architecture", which Expo
SDK 57 makes mandatory with no opt-out.** The native module fails to register at all under it —
`dgram` really is `null`.

This retroactively explains something misdiagnosed earlier the same day: SSDP discovery
(ADR-HEARTH-095) was attributed to "works, just needs Apple's multicast entitlement." In fact it's
been silently failing this whole time for the same underlying reason — `SsdpDiscoveryProvider.ts`
also calls `dgram.createSocket()` unguarded, and `scanAllProviders`'s `Promise.allSettled` quietly
absorbed the rejection, making it look like "found nothing" rather than "crashed." SSDP is left
as-is for now (a real, separate, lower-urgency fix — see Consequences below), since Family Command
Center's own discovery path never depended on this library and is unaffected.

**Fix applied**: moved the entire DDP mechanism (both the one-time credential capture and the
ongoing wake) into Family Command Center — `src/lib/network/ps5-client.ts` there, three new
routes under `/api/integrations/hearth/ps5/` (`pair/start`, `pair/status`, `poweron`), same
pattern XboxDriver.ts's power-on already used for a different reason (no raw-socket capability at
all, vs. this library's New-Architecture incompatibility). Full details, including the
`CAP_NET_BIND_SERVICE` systemd capability grant port 987 required (confirmed live: plain non-root
bind attempt returned `EACCES`), are in that project's own `adr/0174-hearth-ps5-pairing-wake-relay.md`.

Hearth's own `Ps5Client.ts` was rewritten to call these routes via `fetch` (mirroring
XboxDriver.ts's `loadFamilyCommandCenterConfig` + bearer-token pattern) instead of touching
`react-native-udp` at all. Pairing is now poll-based (`captureCredentials` starts a session, then
polls `pair/status` every 2s) rather than one long-held phone-side request — deliberately, since a
single in-flight fetch from a backgrounded React Native app is not reliably guaranteed to survive
iOS suspending it for however long the household member takes to switch to the PlayStation App and
tap the device; polling a few seconds apart works regardless of Hearth's own foreground state,
since the actual listening now happens on Family Command Center, independent of the phone.
`Ps5Driver.ts` and `AddPs5DeviceScreen.tsx` needed no changes — both already talked to `Ps5Client`
through the same interface.

**Consequences of this addendum:**
- PS5 now requires Family Command Center to be paired, same as LG (for a different underlying
  reason — LG needs it for TLS trust, PS5 needs it because the UDP library it would otherwise use
  doesn't work under this Expo SDK at all). Documented directly in this driver's own scope, not
  hidden.
- `react-native-udp` remains a project dependency (SSDP still references it) but is now unused by
  the PS5 driver entirely — a net simplification for this driver, and one fewer thing depending on
  a library now confirmed broken under this app's own Expo SDK.
- SSDP discovery being silently non-functional is a real, separate, flagged gap — worth fixing
  (likely by finding or building a genuinely New-Architecture-compatible UDP library, or by
  routing SSDP's own scan through Family Command Center too) but deliberately not bundled into
  this same change, since it degrades safely today rather than crashing.
- Verified end-to-end against the real Family Command Center service (not yet against a real PS5):
  `POST pair/start` returned a real session id, `GET pair/status` confirmed `"pending"` (the
  server socket is genuinely bound and listening on port 987). `npx tsc --noEmit` clean, full
  `npx jest --silent` → 425/425 passing. Still fully OTA-shippable — this removes a native
  dependency from this driver rather than adding one.
- **Still not yet verified against a real console** — the server-side capture session works; the
  actual "tap the device in the PlayStation App" step is Sean's own next test.

## Addendum (2026-09-19, live testing): a real server-side bug blocked every retry, and a real app-identity correction

Two findings from Sean's actual live test attempt:

1. **The right app is "Remote Play," not the general "PlayStation App."** Sony ships these as two
   separate apps — the general one is account/notifications/store management, while Remote Play is
   the one built for discovering and streaming to a specific console, which is what the credential
   capture this driver depends on actually needs. Corrected directly by Sean, who has real
   first-hand familiarity with the ecosystem this session doesn't.
2. **A real bug blocked pairing from ever working past the first attempt**: `POST /pair/start`
   returned a 502 on any retry. Root-caused and fixed on Family Command Center's side — see that
   project's own `adr/0174-hearth-ps5-pairing-wake-relay.md` addendum for the full diagnosis
   (closing an already-closed `dgram` socket during session cleanup threw uncaught). This fully
   explains why the first live attempt found nothing in the PlayStation App: pairing had already
   silently broken itself before Remote Play was ever tried.

No Hearth-side code changed for this fix — it lives entirely in Family Command Center's
`ps5-client.ts`. Still pending: an actual successful capture against Sean's real PS5 via Remote
Play, now that both the app-identity confusion and the server-side bug are resolved.

## Addendum (2026-09-19, later): the entire mechanism was PS4-only — rebuilt on real PSN OAuth

Live-tested with Remote Play open and the 502 fixed: still zero packets ever reached the fake
console, across multiple attempts and 90+ seconds each. Root-caused by cross-referencing real PS5
owners in the Home Assistant community: **"the ps5 doesn't support the 2nd screen app the way the
ps4 did, which is what HA used to leverage."** Confirmed independently — Home Assistant's own
`ps4` integration (which still uses the exact mechanism this driver was built on) has an open,
unfulfilled community feature request for PS5 support, for the same reason. This was never going
to work against a real PS5, regardless of app or wait time.

**The real, current, working tool is `playactor`** (github.com/dhleong/playactor, same author as
the PS4-era `ps4-waker`). Its actual mechanism: a real PSN OAuth login (the household member signs
into their own Sony account on Sony's own domain — never seen by Hearth or Family Command Center),
then the console's own Settings → System → Remote Play → Link Device screen shows an 8-digit PIN,
which registers with the console over a real, device-versioned, cryptographically signed Remote
Play handshake. The final wake packet also uses different values entirely from this driver's
original PS4-era assumptions: **port 9302** (not 987) and **protocol version `00030010`** (not
`00020020`).

**Decision**: rather than reimplement that registration crypto by hand (a real risk this project's
own security rules specifically warn against — "prefer well-established libraries... for
cryptography"), Family Command Center now drives the real `playactor` CLI as a managed process
(full detail in that project's own `adr/0174` addendum). Hearth's side changed to match:
`Ps5Client.ts` now exposes the multi-step flow this real pairing needs (`startLogin`,
`submitRedirectUrl`, `submitPin`, `getLoginStatus`) instead of a single credential-capture call,
`Ps5Driver.ts` no longer needs a `credentials` object at all (Family Command Center resolves its
own stored credential by the console's MAC on every wake — the driver only ever needs an IP now,
matching every other simple driver's config shape), and `AddPs5DeviceScreen.tsx` became a real
3-stage interactive screen (open a real Sony login link → paste the resulting redirect URL → enter
the console's own PIN) instead of a single "Pair" button.

**Verified live, end to end, against the real household PS5**: OAuth login succeeded, PIN
registration succeeded, and a wake sent through the real `/poweron` HTTP route (not just the bare
CLI) completed successfully. This is the first fully real-hardware-confirmed outcome across all
four new drivers built this session.

Verified: `npx jest src/drivers/gaming/ps5 --silent` and full `npx jest --silent` → 457/457
passing. `npx tsc --noEmit` clean. Still fully OTA-shippable on Hearth's side — no native
dependency added or removed here, just a different HTTP relay shape.
