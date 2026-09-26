# ADR-HEARTH-162: Roadmap additions from the major-home-apps research round

**Date:** 2026-09-26
**Status:** Proposed. Extends ADR-HEARTH-158. Items marked DECISION need Sean's answer.

## Context
Sean asked for another round covering Alexa/Ring, Apple Home, Google Home, SmartThings, Hue, Sonos, IKEA,
security/camera apps and family organizers. Two research agents reported (web summaries; review themes are directional).

## Findings that add to or reorder ADR-158
1. **Never dead-end on "No Response"** (Apple Home's top complaint). Add a per-device status line that names the
   cause: "TV asleep, waking", "Relay reachable, LAN not", "Pi offline 4 min". Size S-M. Promote to Tier 1.
2. **Read back state after every command and keep a household activity log** ("Sean turned off the living room TV").
   Routines that show as run but do nothing are the top SmartThings/Alexa complaint. Size M.
3. **"Home (LAN)" / "Away (relay)" badge**, and surface tunnel changes proactively. Size S.
4. **Alerts for silent failure:** Pi, relay or a device offline shows on Hearth and the kiosk with "last seen".
   Size S.
5. **Never remove a feature without parity; ship layout changes behind a "classic" toggle** (Sonos 2024 backlash).
   Matters because one OTA channel serves both phones. Size S.
6. **Roles: two equal admins first,** then optional per-person hiding and kid/guest roles. Avoid owner-only editing
   (Google Home complaint). Size M. Folds into ADR-158 item 9.
7. **Lock screen / Control Center controls** for the top actions; re-test after every iOS beta. Size M.
8. **Actionable, quiet notifications** with quiet hours from day one. Size S-M.
9. **Scenes with a "Run now" test button and per-step results;** skip geofencing until basics are solid. Size M.
10. **Reorder rooms, devices, favorites; pinned row.** Size S.
11. **Kiosk chores/stars for kids and two-way calendar sync** (Skylight strengths). FCC work, size M each. DECISION:
    whether FCC should grow into a family organizer at all.
12. **"What leaves your house" privacy screen** stating what passes through Cloudflare. Size S.

## Avoid
AI/voice layers on a shaky core; subscriptions or account walls for core function; cloud dependence for basic
control; notification floods; a kiosk needing hands-on maintenance.

## Consequences
Items 1, 3, 4 and 5 are small and reinforce the reliability theme; they go next. Items 6 and 11 need Sean's decision.
