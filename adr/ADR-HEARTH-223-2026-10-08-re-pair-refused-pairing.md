# ADR-HEARTH-223: a guided "Re-pair this TV" when a TV refuses its saved pairing

## Status

Accepted (LG webOS only; see Scope)

## Context

Sean (2026-10-08): "continue working on the items that home assistant and other apps can do" for
device addition. ADR-HEARTH-221's comparison with Home Assistant listed one open item: HA's *reauth*
step. When credentials expire or are revoked, HA marks the entry "needs attention", runs the pairing
again and updates the EXISTING device rather than creating a new one.

Hearth had the pieces but no flow: LG saves a `clientKey`; when the TV forgets it, `connect()` times
out with a "TV isn't recognizing a previous pairing" message that only ever appeared as a line of text
on the remote screen's reconnect card, and the only remedy was removing and re-adding the device.

Hard constraint (project memory): re-registering a TV under a DIFFERENT pairing identity can make it
distrust Hearth's existing key. And a re-pair puts a prompt on the TV, so it may only ever be started
by the person, who can see the TV.

## Decision

### What counts as "the key was rejected"

`LgWebOsClient` now records whether the TV answered the register request with its approval-prompt
reply (`payload.pairingType === "PROMPT"`, the reply the client already treated as "prompt is
showing"). When a saved client-key was sent AND that prompt reply was seen AND nobody approved within
the pairing window, it throws `SavedPairingRejectedError`. Nothing else produces it.

Why this is reliable: a TV that honors the saved key answers with the final client-key at once and
never prompts. A TV that answers with a fresh prompt has positively said "I do not know this key".
Silence (TV off, asleep, wrong network, relay problems) is indistinguishable from many harmless
things, so a saved key that merely times out with no reply is NOT flagged; it keeps its existing
plain `Error` and wording. A user tapping "No" is an explicit decision, not a forgotten key, and is
also not flagged. A first-time pairing (no saved key) is never flagged.

The driver records the flag in `DeviceState.values.needsRePair` (never in `config`, so it is never
persisted or shared). It is sticky across later non-rejection failures (a TV switched off overnight
must not hide it) and clears by itself on the next successful connect, which replaces `values`.

### The flow

1. Remote screen: when `needsRePair` is set and the device is not connected, the reconnect card is
   replaced by a re-pair card: what happened, "turn it on and keep it in view", the brand's own
   description of the box that will appear (`pairingCopy`, ADR-HEARTH-155), and that name, room and
   sharing stay the same. One button, "Re-pair this TV".
2. Tapping it (the only trigger) runs `driver.rePair(device)` inside a `PairingSession`, so the card
   shows the brand prompt, a live countdown equal to the driver's real timeout, and Cancel.
3. `LgWebOsDriver.rePair`: disconnect (stops timers, supersedes anything connecting with the old
   key), then `connectWithFreshPairing`, which removes ONLY `clientKey` from `device.config` for
   the one connect. That register uses the same manifest as always (tested: identical payload minus
   `client-key`). The TV shows its prompt; on approval the driver stores the new key.
4. Success: `App.handleRePair` re-saves the same `Device` object through the existing
   `handleDeviceUpdatedInPlace` path (registry, state bridge, SecureStore). Id, name, room and shared
   flag are untouched. The card shows "Connected!" and steps aside.
5. Failure or timeout: the old key is put back (never over a newer one), the card shows plain
   language (`describePairingFailure` + "Nothing was changed: the old pairing is still saved, and
   Hearth keeps trying in the background") with Try again and Cancel. Cancel returns to the offer
   while the flag is still set. Never a dead end.
6. Elsewhere: the Devices row says "Needs re-pairing — open it to fix"; the offline banner for that
   device says it needs re-pairing and offers "Re-pair", which opens the remote (so the TV can be
   watched). A flagged device gets the banner even if it never connected this session (the outage
   tracker ignores such devices, and they are exactly the ones whose key is refused).

### Where brand logic lives

UI and App contain no brand checks. `DeviceDriver.rePair?` is the capability (App and
`DevicesTabScreen` offer the action only when the driver implements it; restricted kid/guest phones
never see it); the shared pieces are `needsRePair.ts`, `SavedPairingRejectedError`,
`connectWithFreshPairing`, `rePairFlow.ts` (pure view logic), `rePairCopy.ts`, `useRePair`.

While the card asks for attention, the remote hides the streaming-app and input rows (disabled
anyway): without that the card's height forced the remote past its minimum fit scale at 375x667.

## Scope

LG only. Samsung's saved `token` times out with the same message but the TV gives no "prompt shown"
reply, so a rejected token cannot be told from a TV that is off. Its explicit
`ms.channel.unauthorized` event is ambiguous with the TV's own "deny new devices" policy, which a
re-pair cannot fix. Adding Samsung later is a driver `rePair` plus a reliable signal; the UI needs
no change.

## Not done / known limits

- Not verified against a real TV (none was touched). The "PROMPT reply after a saved key" signal
  rests on the existing handshake handling and its test fixture; if a firmware never sends it, the
  card simply never appears and nothing regresses.
- The household shared device list is not republished: the existing key-update path (ADR-HEARTH-131
  auto-sync) is additive and only publishes new devices, and the manual Share button replaces the
  whole list. A phone that later imports this device from the household list gets whatever key was
  published and can use this same flow.
- Pre-existing behavior unchanged: the driver's background retries still send the saved key (and the
  TV may show its prompt) until the person re-pairs or approves it.
- The Devices tab already has a "Re-pair" button on the household-token upgrade banner
  (`TokenUpgradeBanner`); that is a different feature using the same word.

## Consequences

- Tests: `LgWebOsClient.test.ts` (4), `LgWebOsDriver.test.ts` (8: flag, no-flag on silence, same
  manifest, abandons in-flight, success keeps identity, failure restores key, retry uses old key),
  `connectWithFreshPairing`, `savedPairingRejected`, `needsRePair`, `rePairFlow`, `rePairCopy`,
  `describeDeviceStatus`, `chooseOfflineAlert`, demo driver.
- ui-verify: `remote-lg-repair-{offer,waiting,failed,connected}` (assertFit at 375x667, 393x852,
  430x932), `devices-home-repair-needed`, `offline-banner-repair`; demo `?repair=rejected |
  rejected-fails | rejected-ok`.
