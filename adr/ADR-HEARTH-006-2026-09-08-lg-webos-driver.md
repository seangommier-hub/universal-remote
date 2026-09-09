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
## Update 2026-09-09: the first real-hardware test was inconclusive, not failed

`scripts/test-lg-connection.js` was run once against `192.168.200.13` (a
43" LG, not Sean's primary 75" — see the LG update thread this same night)
and got "Received network error or non-101 status code," which this ADR's
original text (and a status message to Sean) treated as evidence for the
"unencrypted port rejected" scenario described above.

That conclusion was premature. A later network sweep from this dev machine
(on the Primary subnet, 192.168.1.x) found **no** device answering on port
3000 (or 8001/8060) anywhere on Primary — strongly suggesting Sean's real
TVs live on Guest or IoT, both confirmed elsewhere in this project as
network-isolated from Primary by the router itself. That isolation would
produce the exact same "network error" independent of whether the TV's
port 3000 actually works — **the one real test run so far cannot
distinguish "TV rejected the unencrypted protocol" from "router blocked
Primary→Guest traffic before the TV was ever reached."**

This driver's real-hardware status is therefore genuinely **untested**, not
"tested and found broken." The only valid way to test it is from a device
on the *same* network segment as the TV — i.e. Sean's phone, connected to
whichever WiFi network (Guest/IoT/Primary) the TV is actually on, running
the app and using "+ Add LG TV" directly. Re-running the standalone script
from this dev machine cannot produce a meaningful result while it sits on
a different, isolated segment than the TV.

**Confirmed, not just theorized (2026-09-09):** Sean's real 75" LG TV is at
`10.20.30.40` on the "sewer rat" WiFi network — the Pi-managed segment the
family-command-center session separately identified as `10.20.30.x`. A raw
TCP connect from this dev machine to `10.20.30.40:3000`, using Node's own
socket API directly (not the driver, not the standalone script — isolating
the network layer specifically), **times out with zero response** — no
`ECONNREFUSED`, nothing. That is the specific signature of traffic being
silently dropped by network isolation, not of a device actively rejecting
a connection. This closes the ambiguity above: the driver's actual protocol
behavior against this TV remains completely unknown, because no connection
attempt from this machine has ever reached the TV at the network layer at
all. Testing this driver requires running the app from a device already on
the `10.20.30.x` / "sewer rat" network — this dev machine cannot do it
under any circumstance, regardless of what code changes.

- Any fourth TV driver should keep following this same pattern: verify
  against a real source, declare only implemented capabilities, and prefer
  reading real state back over assuming a command worked wherever the
  protocol actually supports a query.
