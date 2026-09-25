# ADR-HEARTH-139: Play and pause on the select button, by holding

**Date:** 2026-09-25
**Status:** Accepted, implemented and unit-tested; not yet tried on a real phone against Netflix

## Context

Sean: "play button not working but the keypad is so that's good." The LG's round center button only sent
OK (ADR-HEARTH-114/117). That TV never reports whether video is playing, so the button cannot know when
to send play versus pause.

## Question asked (ADR-GLOBAL-002)

Offered: separate Play/Pause buttons (recommended); hold the center button; a single guessing toggle.
Sean picked separate Play/Pause buttons, then, while I was building it: "although i want it to all be in
the select button." His last statement was taken as controlling, so the separate buttons were removed
before shipping and the four transport commands are driven from the center button instead.

## Decision

- LG declares explicit `play`, `pause`, `rewind`, `fastForward`, sent as `ssap://media.controls/<name>`.
  Confirmed live: the TV answered `returnValue:true` to pause and play while Netflix was in front.
- Center button: **tap** is still an immediate plain OK (what a real Magic Remote does; no added delay).
  **Hold** (400ms, new `onLongPress` on `CapabilityButton`) sends the explicit Pause, and the next hold
  sends Play, alternating. A tap resets the alternation, since an OK may itself have paused or resumed.
- No guessing from command history, per ADR-HEARTH-117: every send is a real, explicit command.

## Consequences

- If the video was paused with a tap, the first hold sends Pause, which does nothing, and a second hold
  sends Play. That is the cost of a TV that cannot report state; it is why hold is used instead of a
  hidden toggle.
- Rewind and fast-forward exist in the driver but have no on-screen control yet.
- The hold gesture is not advertised in the UI beyond this note; tell Sean.
