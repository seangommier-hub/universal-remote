# ADR-HEARTH-174: Home Assistant benchmark and roadmap

**Date:** 2026-09-26
**Status:** Accepted by Sean's instruction "do deep research on home assistant and create a road map, then let's close the gaps". Extends ADR-158 and ADR-162.

## Context
Two research reports: (1) Home Assistant (HA) as the benchmark for what a household expects; (2) how deep Hearth's own HA driver (ADR-166: REST only, pasted token, 10 s per-device polling, four domains) should go.

## Positioning
Hearth stays the remote. HA is weakest as a TV remote (lowest-common-denominator media_player, brand integrations that break) and strongest at breadth and automation. Hearth treats HA as an optional back end and adopts only the HA ideas that suit a two-adult household. It does not become a hub.

## Do not copy
YAML or a general automation editor, blueprints/helpers/expert tiers, the entity/device abstraction shown to users, local Assist, Zigbee/Matter stacks and add-ons, per-user roles beyond a kid mode, a drag-and-drop card dashboard.

## Track A: deepen the HA integration (build order from report 2)
1. Shared per-instance client and credential (token off each entity's config). Migration for existing HA devices.
2. WebSocket session: auth, id routing, subscribe state changes, ping, reconnect + resnapshot, background-safe fallback to polling.
3. Registries: HA areas become Hearth rooms (ADR-173), bulk sync screen with room checkboxes, skip disabled/hidden/diagnostic entities.
4. Domains: cover, lock, scene, script, automation, button, input_boolean (needs new capability ids; confirm dialogs for lock/garage).
5. Climate and fan; sensors as read-only info tiles; vacuum mapping.
6. Extended media_player (next/previous, browse, play_media); remote access through the FCC relay (internal/external URL); camera snapshot; alarm panel with live code entry.
7. Later: OAuth sign-in (needs a hosted client_id page and a domain), mDNS discovery (native module or via the FCC), Assist text box.

## Track B: household features adopted from HA (ordered by value for this home)
1. Kid mode: per-phone restricted device set behind an adult PIN, actions attributed in the log. Size S.
2. Log cause attribution: person vs Activity vs schedule vs HA. Size S.
3. "Now" summary: what is on and where, one-tap off. Size S.
4. Scheduled and simple triggered Activities on the FCC (form UI, no YAML): needs the headless runner promoted (ADR-151). Size L.
5. FCC nightly config backup and one-tap restore. Size M.
6. HA webhook/event bridge (HA can fire Hearth Activities and the reverse). Size M.
7. Blocked on a native build (Expo free-plan cap until Oct 1): Siri Shortcuts and Lock Screen widget for Activities, background presence ("everyone left, turn everything off?"), actionable push notifications.

## Consequences
Track A step 1-3 and Track B 1-2 start now in separate branches. Steps needing new capability ids get their own ADR first. Native-dependent items wait for the next native build, which should bundle them (Siri Shortcuts, widget, background location, push, mDNS module, iOS ATS local-networking exception).
