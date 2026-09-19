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
