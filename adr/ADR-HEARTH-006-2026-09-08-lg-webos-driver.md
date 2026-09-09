# ADR-HEARTH-006: LG webOS driver — unencrypted port only, powerOff-only, no inputSelection

**Date:** 2026-09-08
**Status:** Accepted

## Context

Third real TV driver (LG webOS), continuing Phase 2's goal of proving the
device/capability abstraction across multiple real manufacturers. Sean
confirmed he owns an LG TV (live and reachable while this was built).

Protocol researched against the widely-used reference implementation
[hobbyquaker/lgtv2](https://github.com/hobbyquaker/lgtv2) (`index.js`,
`pairing.json`, `README.md`) — not guessed. Verified: the exact `register`
handshake manifest, the SSAP request/response envelope
(`{type, id, uri, payload}`), the separate pointer-input socket mechanism
for button presses (obtained via
`ssap://com.webos.service.networkinput/getPointerInputSocket`, then a raw
`type:button\nname:X\n\n` text protocol on that second socket — not the
main SSAP socket), and the documented `ssap://` URI list.

Same class of issue as ADR-HEARTH-005 (Samsung) was checked and confirmed
present here too: modern LG TVs' encrypted `wss://<ip>:3001` path uses a
certificate from LG's private CA, which React Native's `WebSocket` cannot
be configured to trust (same `rejectUnauthorized` gap). **The unencrypted
window is narrower than Samsung's**: per multiple sourced reports, TVs from
roughly 2023 onward accept *only* the encrypted port, while pre-2018 TVs
accept *only* the unencrypted port — there is a much smaller multi-year
band where both work, unlike Samsung where the unencrypted path's exact
cutoff is less sharply reported.

## Decision

`LgWebOsDriver` (`src/drivers/tv/lg/`) connects only via
`ws://<ip>:3000` (root path, unencrypted). Declares capabilities:
`powerOff, volumeUp, volumeDown, setVolume, mute, channelUp, channelDown,
directionalNavigation, select, back, home, menu`.

Explicitly NOT declared:
- **`power` (toggle) or `powerOn`** — no documented SSAP method turns a TV
  on; only `ssap://system/turnOff` exists. Waking one requires Wake-on-LAN,
  a separate unimplemented mechanism. Declaring a generic `power` toggle
  the driver can't actually complete in both directions would be exactly
  the kind of fake capability the project's rules prohibit.
- **`inputSelection`** — switching inputs needs `ssap://tv/getExternalInputList`
  first to learn valid `inputId` values for the specific TV; not implemented.

Volume/mute state read-back (`ssap://audio/getVolume`) uses **inferred**
field names (`volume`, `mute`) — the fetched community docs listed the URI
but not a full payload schema, unlike Sony's officially-documented,
explicitly-typed response. Coded to degrade to `undefined` rather than
throw if the real field names differ; this needs confirming against
Sean's actual TV.

## Rationale

Directly extends the same reasoning as ADR-HEARTH-004 (Sony) and
ADR-HEARTH-005 (Samsung): declare only what's verified and actually
implemented, so `UniversalTvRemote`'s capability-gated rendering stays
honest for every real device, not just mocks.

The `power`/`powerOn`/`powerOff` split in `CapabilityId` (added when the
type was first designed, unused until now) turned out to be exactly the
right call — LG is the first driver where a device genuinely can't support
a full power toggle, and having the ids already split meant no type change
was needed, just a UI extension (`UniversalTvRemote` now renders `Power
On`/`Power Off` buttons when those capabilities are present instead of a
single toggle).

## Consequences

- Given the narrow unencrypted-port window described above, **this driver
  may well not connect to Sean's actual LG TV at all** if it's from 2023 or
  later — a real possibility, not just formal caution. `scripts/test-lg-connection.js`
  exists specifically to find out quickly, independent of the mobile UI.
- If port 3000 doesn't work, LG joins Samsung's encrypted-path problem:
  real progress here requires a Dev Build + a native TLS-trust module (or
  equivalent), to be scoped in a future ADR — not assumed or half-built now.
- Any fourth TV driver should keep following this same pattern: verify
  against a real source, declare only implemented capabilities, and prefer
  reading real state back over assuming a command worked wherever the
  protocol actually supports a query.
