# ADR-HEARTH-224: room chips on the "Add all ready" summary card

## Status

Accepted

## Context

ADR-HEARTH-221 added "Which room is it in?" to the single-device post-add screen, copying Home
Assistant's area step. "Add all ready" skips that screen by design (ADR-HEARTH-167/195), so devices
added in bulk still had to be given a room one at a time from the long-press menu. Sean asked to
keep working through the items Home Assistant and other apps do.

## Decision

The post-"Add all" summary card (`BulkAddSummaryCard`) now shows, under each added device's name, a
single horizontally scrolling row of room chips (rooms in use plus the built-in suggestions). The
room named in each device's own name is pre-selected and saved straight away (`planInitialRooms`,
reusing `suggestRoom` from ADR-221); tapping a chip picks it, tapping the selected chip clears it
(`nextRoom`). Choices are saved on every tap through a new `applyRoomChoices` (like the Home
Assistant import's `applyImportedRooms`, but an empty name removes the device from its room).
State lives in `useBulkFollowup` (`rooms`, `roomOptions`, `pickRoom`), threaded through
`DiscoverDevicesScreen` -> `AddAllCard` -> the card.

## Consequences

- A bulk add leaves devices grouped by room where their names say so, with one tap to fix the rest.
- A single scrolling chip row per device keeps the card compact for large batches.
- Tests: `bulkRooms.test.ts` (4). Screenshot-checked in the `discover-add-all-done` scenario.
