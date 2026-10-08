# ADR-HEARTH-221: ask which room a device is in when it is added

## Status

Accepted

## Context

Sean (2026-10-08): "keep on working on the new device addition and look at home assist and how we
can mimic that." Compared Hearth's add flow with Home Assistant's (config-flow docs, concepts page):

| Home Assistant | Hearth today |
|---|---|
| Discovered devices appear on their own; never auto-added, user confirms | "Suggested From Your Network" on the Devices tab (ADR-092/148/153); Add all ready (ADR-167) |
| Stable unique ID (MAC/serial) prevents duplicates and updates a changed IP | MAC identity and re-location by MAC (ADR-156) |
| "Ignore" a discovered device | Hide, remembered (ADR-153) |
| Reconfigure (change host) / reauth (credentials expired) | Edit address; re-pair paths per driver |
| Searchable integration list | Searchable brand picker (ADR-167) |
| **Every add ends with "which area is it in?" (and a name)** | **Name and sharing only; room only later via long-press > Room** |

The room question was the one clear gap in the add flow itself.

## Decision

The post-add screen gains "Which room is it in?": chips of the rooms already in use plus the
built-in suggestions (`roomChoices`). The room named in the device's own name is pre-selected
(`suggestRoom`: "Living Room TV" -> "Living Room"; whole-word, case/punctuation-insensitive,
longest match wins). Tapping the selected chip clears it; none is fine. On Done the room is saved
into this phone's layout store with the same `applyImportedRooms` the Home Assistant import uses
(ADR-173). Bulk "Add all ready" is unchanged for now: it skips the post-add screen by design
(ADR-167), so those devices still get a room from the long-press menu.

## Consequences

- A newly added device lands in its room immediately, so room grouping works without a second trip.
- No new storage: rooms stay in the existing layout store; the household-shared device list does not
  carry rooms (unchanged).
- Tests: `suggestRoom.test.ts` (5). `post-add` ui-verify scenario screenshot confirms the chips and
  the pre-selection.

## Next candidates (not built)

Room chips on the bulk-add summary card; a passive "N new devices found" badge so discovery
doesn't require opening Discover (Home Assistant's Discovered notification); a one-tap
"re-pair" prompt when a saved LG/Samsung key is rejected (HA's reauth).
