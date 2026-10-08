# ADR-HEARTH-226: Command Center remote surfaces send failures instead of failing silently

## Status

Accepted

## Context

Sean, directly (2026-10-08): "phone touch pad shows the cursor but doesn't allow clicking." A raw
click sent through `RfbClient` over the exact same relay path the phone uses genuinely worked (it
navigated the live Family Command Center dashboard to a different page), proving the RFB protocol,
the relay, and the compositor are all fine. Whatever fails on the real phone was invisible: neither
`CommandCenterRemoteScreen.tsx` nor `RfbClient.ts` ever logged a send failure, and a dead
connection left `status` reading "connected" with nothing to actually show it was wrong.

## Decision

`moveCursor`, `click` and `pressKey` now wrap their `RfbClient` calls in try/catch:

- A genuine send failure logs a warning and shows a brief on-screen message under the trackpad
  hint (`actionError`, same timed-clear pattern as `UniversalTvRemote.tsx`'s `commandError`).
- `RfbClient`'s own "Not connected" message (its `send()` throws this when the socket is already
  closed) is treated as the connection actually being gone, not a one-off glitch: it clears
  `clientRef`, flips `status` back to `"error"`, and tells Sean plainly to reopen the screen,
  instead of silently no-opping forever on a stale ref while the UI still claims "connected".
- `clientRef.current` being null when a handler fires (a stale-closure/race case, not yet observed
  but now at least visible) logs a warning rather than silently returning.

`RfbClient.ts` itself is left with no logging, consistent with its own file-header framing as a
pure protocol class -- the caller (this screen) is what has UI/state to react with.

## Consequences

- The next time this happens, the client log pull that found nothing this time will actually show
  what failed and why, instead of a silent gap.
- No root cause is claimed fixed by this ADR -- the actual failure on Sean's phone is still
  unexplained; this only makes it diagnosable instead of invisible.
- `tsc` is clean; full suite 2496 passed (no new test added -- this project doesn't unit-test RN
  screen components directly, only extracted pure logic, and nothing pure was extracted here).
- Needs an EAS update to reach the phones.
