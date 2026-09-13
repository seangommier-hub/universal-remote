# ADR-HEARTH-065: Competitive research and product roadmap

**Date:** 2026-09-13
**Status:** Accepted

## Context

Sean, directly: "look online at other apps like this and figure out what needs to be added. do
deep research and make this the best family control center management app for tvs, smarthome
devices, etc.... you need to have ingenuity and really be able to problem solve." A full white
paper documenting the research, findings, and resulting roadmap was produced and delivered
separately (`Hearth-White-Paper-2026-09-13.pdf`) — this ADR is the decision record: what was found,
what was decided to build now versus later, and why.

## Research summary

Surveyed Logitech Harmony's legacy (and why SofaBaton/Roomie Remote succeeded it), Home Assistant
vs. SmartThings vs. Apple Home, Matter/Thread's 2026 status, Google Home's family permission model,
App Store reviews of competing universal-remote apps, and geofencing/notification patterns across
major platforms. Full citations are in the white paper. Two findings were load-bearing enough to
act on immediately rather than just record:

1. **"Difficulty connecting to certain devices like Xbox"** is an explicitly cited, real complaint
   about competing remote apps — and this household's own device inventory (found hours earlier the
   same night, via the router-merge work) independently confirmed two real Xbox consoles with zero
   Hearth support. Acted on immediately — see ADR-HEARTH-064.
2. **"The app has to stay open to keep working"** is the single most-cited complaint about
   competing remote apps, and traces directly to a real, already-known constraint of this specific
   codebase: Expo Go has no background-execution capability. This isn't a new gap to close with a
   feature — it's the same constraint already driving the in-progress native-build/signed-IPA work,
   which resolves it as a side effect once complete.

## Decision

Built tonight, in order: the Xbox power-on driver (ADR-HEARTH-064) — the one finding with a real,
research-confirmed protocol, a concrete household need, and no architectural prerequisite. Deferred
research-confirmed but larger items to the roadmap below rather than expanding tonight's scope
further:

- **PS5 wake support** — real and documented, but needs a per-console Remote Play pairing flow
  heavier than Xbox's zero-setup broadcast.
- **Full Xbox control** (power-off, media) — needs a full authenticated SmartGlass session
  (RSA/ECDH handshake + Microsoft OAuth), a materially bigger integration than power-on.
- **Per-person permission roles inside Hearth** (distinct from Family Command Center's existing
  network-level restriction) — a real gap against Google Home's Admin/Member model, but a genuine
  architecture change (an auth/identity concept Hearth doesn't have at all today), not a
  same-night addition.
- **Geofenced scene triggers, home-screen widgets, Siri Shortcuts, device-left-on notifications** —
  each real and well-precedented industry-wide, each gated in whole or part on the native-build
  transition already underway for an unrelated reason (installing a real signed IPA).
- **Matter support** — explicitly scoped as strategic/long-horizon, not near-term: its value is
  collapsing many proprietary integrations into one, which only pays off once enough of this
  household's actual hardware is Matter-certified to justify the investment. Revisiting this
  judgment belongs in its own future ADR once that condition changes, not a default assumption
  baked in here.

## Consequences

- The white paper is a point-in-time snapshot (explicitly labeled as such in its own footer) — it
  will drift from the codebase as work continues, and should not be treated as living
  documentation. Re-generate rather than hand-edit if a future refresh is wanted.
- This ADR intentionally does not commit to a delivery order or timeline beyond "immediate /
  near-term / strategic" — each roadmap item above still needs its own scoping ADR before
  implementation, consistent with how ADR-HEARTH-064 was scoped before it was built tonight.
