# ADR-HEARTH-003: Expo Go / SDK version confirmed compatible

**Date:** 2026-09-08
**Status:** Accepted

## Question

`docs/EXPO_COMPATIBILITY.md` (research pass) flagged that Expo Go for SDK 57
was reported by Expo's own changelog as not yet on the Apple App Store as of
that SDK's release, which would have blocked the brief's stated priority of
testing via physical Expo Go on iPhone. Sean was asked to check his iPhone.

## Answer

Sean confirmed his installed Expo Go app shows **SDK 57** — matching this
project's Expo SDK exactly (2026-09-08).

## Rationale

Expo Go only supports the single SDK version it was most recently built
against. Sean's client already being on 57 means whatever the App Store
approval timeline looked like from the changelog, the binary he has is
current and usable right now — no version mismatch, no `eas go` / Dev Build
workaround needed to get onto a physical iPhone.

## Consequences

- The brief's original plan ("Expo Go on iPhone" as the Phase 0 baseline)
  stands as-is; no SDK downgrade or fallback tooling needed at this stage.
- The *other* finding in `docs/EXPO_COMPATIBILITY.md` still holds and is
  unaffected by this: local network device discovery (mDNS/SSDP/raw
  TCP-UDP) will still force a move to an Expo Development Build once
  driver discovery work starts — that is a separate, later trigger, not
  tied to the App Store question resolved here.
