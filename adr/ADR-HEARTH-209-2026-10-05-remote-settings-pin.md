# ADR-HEARTH-209: Owner sets the physical remote's settings PIN from the phone

Date: 2026-10-05
Status: Accepted
Related: hearth-remote-hardware ADR-013 (the decisions); Pi adr/0283 (the routes)

## Context

Sean, 2026-10-05: "on the remote there needs to be a settings panel to add new devices." He chose
"pick from home's devices" and "Owner PIN" (questions and answers logged in hardware ADR-013). The
remote's settings panel needs a PIN that only the household owner can set. The phone's Household
remotes screen is already the owner-only place for physical-remote admin (ADR-HEARTH-201).

## Decision

- **`src/discovery/remoteSettingsPin.ts`** (a new single-purpose client):
  - `fetchRemoteSettingsPinIsSet()` calls the Pi's `GET .../physical-remote/settings-pin`.
  - `saveRemoteSettingsPin(pin)` calls `PUT`, with the same 4-8 digit rule checked locally first.
    A malformed PIN is never sent.
  - A non-owner's 403 becomes a plain sentence.
- **`src/ui/RemoteSettingsPinPanel.tsx`** sits on Household remotes, above "Pair a remote".
  - It shows whether a PIN is set and accepts digits only, masked.
  - The button reads "Set PIN" or "Change PIN".
- The PIN is one per household, not per remote, so a newly paired remote needs no extra setup.
  The Pi stores only a salted hash.

## Tests

`remoteSettingsPin.test.ts` covers:
- the format rule;
- reading the status;
- the PUT body;
- that a malformed PIN is never sent;
- the 403 message.
