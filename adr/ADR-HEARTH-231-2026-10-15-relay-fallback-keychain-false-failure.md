# ADR-HEARTH-231: Off-LAN relay fallback no longer mistakes a locked phone for a dead connection

**Date:** 2026-10-15
**Status:** Accepted, implemented

## Context

Sean, directly: "lg still not working." Live client-log pull (passive, not an ad-hoc probe against
the TV itself -- see `feedback_no_adhoc_lg_probes_on_live_tv` memory, which explicitly warns against
that path right now) showed the Downstairs Living Room LG TV's reconnect loop burning several
attempts in a row with this as the logged failure reason:

```
FunctionCallException: Calling the 'getValueWithKeyAsync' function has failed
→ Caused by: KeyChainException: User interaction is not allowed.
```

The same log also showed `RokuEcpDriver` ("Luca's Office") hitting the identical failure shape
around the same time.

## Root cause

`loadFamilyCommandCenterConfig()` (`familyCommandCenterConfig.ts`) deliberately *rejects* rather
than resolving null on a SecureStore/Keychain read failure (ADR-HEARTH-196/203) -- a confirmed,
expected failure mode when the phone is locked or the app is backgrounded, which resolves itself
the instant the phone unlocks. Two of its three call sites already learned this lesson
(`familyCommandCenterDeviceLookup.ts`'s self-heal lookups, and every direct caller the ADR-203 test
locks in), but the off-LAN relay fallback path never did:

- `wsRelayFallback.ts` (LG/Samsung's WebSocket relay) called it unguarded inside
  `openSocketWithRelayFallback`'s catch block.
- `httpRelayFallback.ts` (every HTTP-based driver's relay -- Roku, Sony, Kasa, AppleTV,
  SmartThings, Broadlink, etc.) called it unguarded inside `callRelay`.

Either one running while the phone was locked threw a raw `KeyChainException` straight out of the
relay attempt. The calling driver's own `connect()`/reconnect catch (e.g.
`LgWebOsDriver.connectClient`) had no way to tell that apart from a real network failure -- it
logged the Keychain exception as *the reason the TV failed to connect*, counted it as a genuine
failed attempt, and escalated backoff for a cause retrying could never fix. Not a TV-pairing
problem at all; the TV itself was never touched by this.

## Decision

Both relay files now swallow only this one, already-well-understood failure shape via a local
`loadConfigTolerantOfLockedKeychain()` helper (`isKeychainUnavailable()`, same pattern as
ADR-203's other two call sites) and treat it exactly like "Family Command Center isn't configured"
-- the existing, already-handled branch right below. Any *other* config-read failure still
propagates unchanged.

**Not a shared/exported helper.** `familyCommandCenterDeviceLookup.ts` already has its own
equivalent private helper; the obvious move was to export one shared version and point all three
call sites at it. Tried, then reverted: a dozen-plus driver test files (`LgWebOsDriver`,
`SamsungTizenDriver`, `ChromecastDriver`, `RokuEcpDriver`, `HueLightDriver`, `SonosDriver`,
`DenonDriver`, `YamahaMusicCastDriver`, `SonyBraviaDriver`, and more) auto-mock
`familyCommandCenterConfig` wholesale (`jest.mock(path)`, no factory) and only ever control
`loadFamilyCommandCenterConfig` by that exact name. Jest's auto-mock replaces every export
independently -- it does not preserve one mocked export calling through to another -- so renaming
the call site to a new shared export silently stopped those tests' `mockResolvedValue(...)` calls
from having any effect on self-heal re-discovery at all. Caught this by running the full suite
(not just the two files touched), not by inspection; reverted to each site keeping its own local,
non-exported fix once the blast radius was clear. Three near-identical private helpers across the
codebase is a real, acknowledged duplication -- left as-is deliberately, since the alternative
(one shared export) has a worse cost here: silently breaking test coverage for self-heal logic
across every other driver, for the sake of avoiding ~15 lines of duplication three times over.

## Verification

`tsc --noEmit` clean. Full suite: 2559/2560 passing (the one failure,
`runner/shims/shims.test.ts`'s raw `ws` WebSocketServer constructor error, is pre-existing and
unrelated -- a dev-tooling runner test, not app code, untouched by this change). New test cases in
`httpRelayFallback.test.ts` and `wsRelayFallback.test.ts` lock in: a Keychain rejection reads the
same as "not configured" (not a raw exception), while any other config-read failure still
surfaces for real.

## Open, not resolved by this change

The *other* half of "lg still not working": per `project_hearth_lg_connection_reliability` memory
(family-command-center project), this TV's saved pairing trust may have been invalidated by
earlier same-day ad-hoc SSAP probing against it, separate from this Keychain bug. That needs a
physical tap of Allow on the TV's own screen if/when it re-prompts -- not something any software
fix here can do, and not something this session attempted to test directly against the live TV.
