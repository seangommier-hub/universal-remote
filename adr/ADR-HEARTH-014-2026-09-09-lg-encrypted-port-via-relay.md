# ADR-HEARTH-014: LG's encrypted port, solved via the relay's own TLS trust — no Dev Build needed

**Date:** 2026-09-09
**Status:** Implemented on Hearth's side, pending one change on Family Command Center's side

## Context

ADR-HEARTH-006's latest update confirmed against real hardware that Sean's
75" LG TV rejects the unencrypted `ws://3000` webOS port and requires the
encrypted `wss://3001` path, which uses a certificate from LG's private CA
that React Native's `WebSocket` cannot be configured to trust. ADR-HEARTH-013
concluded the fix required an Expo Development Build plus a native
TLS-trust module — real infrastructure work, now blocked on Sean's Apple
Developer Program enrollment sitting in Apple's identity-review queue with
no predictable timeline.

Sean, directly, after being told the Apple review has no ETA: "keep working
on this because i am getting annoyed knowing that it is in expo go, it
should be working. there must be a way." Correct call to keep pushing —
re-examining the actual constraint found one.

## The insight

The certificate-trust limitation is specific to **React Native's built-in
`WebSocket`**, which runs in Expo Go on Sean's phone. It is not a limitation
of the relay path built for ADR-HEARTH-011. That relay's whole job is
opening the real connection to a device from somewhere else — Family
Command Center's Node.js backend on the Pi — and Node.js's own WebSocket/TLS
stack has no such restriction: a server-side WS client can be configured
with `rejectUnauthorized: false` (or a pinned trust-anchor for LG's specific
CA) in a single, ordinary Node.js code path. This was always true; it just
wasn't connected to the LG problem until now, because ADR-HEARTH-011's
relay was designed around the *unencrypted* ports (Sony/Roku/Samsung's
unencrypted path/LG's original unencrypted assumption), so nobody had a
reason yet to ask what happens when the *target* itself is `wss://`.

## Decision

`LgWebOsClient` now targets `wss://<ip>:3001` exclusively (both the main
SSAP socket and the pointer-input socket), via the existing
`openSocketWithRelayFallback` — unchanged code, since it already accepts
any full URL including `wss://` targets (ADR-HEARTH-011's "full URL, not
decomposed ip:port" design decision turns out to matter for exactly this
case). The direct-connect attempt from the phone will always fail (React
Native can't trust the cert) — that's expected, not an error state — and
the existing fallback to Family Command Center's relay is what actually
succeeds, because the relay's outbound connection to the TV happens in
Node.js, not React Native.

`LG_WEBOS_DRIVER_ID` renamed `lg-webos-ws3000` → `lg-webos-wss3001` to stop
the persisted driver id from lying about the protocol it actually uses. Safe
now (no real device has ever successfully paired under the old id — every
prior connection attempt failed at the network or protocol layer per
ADR-HEARTH-006) but would not be safe to rename later once real paired
devices exist referencing the old id.

**Not yet done — requires Family Command Center's side**: their relay's
outbound WebSocket connection needs to accept LG's self-signed/private-CA
certificate when the `target` query param is `wss://`. Today it presumably
uses Node's default TLS validation (rejects untrusted certs, same as any
TLS client), which would make the relay itself fail the same way direct
connection does. Relayed to that session directly, not implemented in this
repo — Hearth's discipline throughout this integration has been to never
grow logic that belongs to Family Command Center's side of the boundary
(ADR-HEARTH-010).

## Rationale

This is a strictly better fix than the Dev Build path for the specific LG
problem: works today, in Expo Go, no Apple account, no native module, no
new infrastructure — reuses a transport layer that already existed and
already passed through arbitrary URLs by design. It does not replace
ADR-HEARTH-013's Dev Build work, which remains necessary for Phase 3's
actual goal (brand-agnostic mDNS/SSDP local discovery, which genuinely has
no relay-shaped workaround) — that work continues in parallel, blocked on
Apple as already logged.

**Security note, not a new decision so much as an extension of an existing
one**: trusting a self-signed certificate for a specific, allowlisted local
device IP is a narrowing of TLS's guarantee (no protection against a
man-in-the-middle between the Pi and the TV), but this connection was
already accepted as no *stronger* than that: the alternative for this exact
class of device has always been plaintext `ws://` (Sony/Roku/Samsung/LG's
original unencrypted assumption), which offers zero confidentiality or
integrity at all on that same local hop. An untrusted-but-encrypted
connection to an allowlisted IP is not a regression from what this project
already ships for every other device — same LAN-local trust model
throughout, same target-IP allowlist and port-scoping Family Command
Center already hardened (ADR-HEARTH-011's security-hardening update)
constraining exactly which host:port combinations the relay will ever
connect to.

## Consequences

- Sean's LG TV can be tested for real the moment Family Command Center
  ships the certificate-trust change — no longer blocked on Apple at all.
- If a future LG TV genuinely only supports the pre-2018 unencrypted
  `ws://3000` path, this driver will not connect to it (no fallback to the
  unencrypted port is implemented). Not built now because it would be
  speculative — Sean's actual TV needs the encrypted path exclusively, and
  building unverified dual-port logic for a device that doesn't exist in
  this project yet would be exactly the kind of premature generalization
  this project's rules avoid. Flagged here so it isn't forgotten if a
  second, older LG TV ever needs supporting.
- Samsung's driver has the identical cert-trust limitation (ADR-HEARTH-005)
  and was not touched by this ADR — Samsung's encrypted port was never
  confirmed necessary against Sean's real Samsung hardware the way LG's
  was, so changing it now would be unverified speculation. If/when
  Samsung's unencrypted path is confirmed broken too, the same relay-side
  fix applies directly, no new design needed.
- 74/74 tests still passing after the port/scheme change (`LgWebOsClient.test.ts`,
  `LgWebOsDriver.test.ts` updated to expect `wss://…:3001`); `tsc --noEmit`
  clean.

## Update 2026-09-09 (same night): relay fix deployed, real-hardware re-test inconclusive (network, not protocol)

Family Command Center deployed the certificate-trust fix, scoped tightly
(`rejectUnauthorized: false` on only the one outbound `wss://` connection,
never process-wide; gated behind the existing known-device allowlist; port
3001 was already in `ALLOWED_RELAY_PORTS`). Verified for real on their side
with an actual self-signed-cert test server, not just code review: fails
without the fix ("self-signed certificate"), works with it (message
round-trips). Residual risk (on-LAN ARP-spoofing MITM of an already-
allowlisted device) documented and accepted on their side as the standard
smart-home local-TLS tradeoff — not pinning individual device certs without
a concrete reason to add that complexity.

Independent code review of this session's own changes (spawned specifically
because this ADR deliberately weakens certificate validation, so it earned
a second look before touching real hardware) found one real gap: no test
anywhere in this project exercised the relay-fallback path succeeding —
every LG/Samsung test drove the *direct* connection to open successfully,
which ADR-HEARTH-014's own reasoning says can never happen on real hardware
for LG specifically. Fixed: added a test to `LgWebOsClient.test.ts` that
simulates the direct `wss://` connect failing and asserts the relay URL,
token, and target are constructed correctly and the handshake completes
over the relayed socket. Passed on the first run. Also fixed a stale class
doc comment (`LgWebOsClient.ts`) still describing the client as
"unencrypted," missed by the mechanical find/replace earlier in the day.

**Re-tested against the real TV (`10.20.30.40`) after the relay fix
deployed — inconclusive, and for a specific, honest reason:** a direct
`wss://10.20.30.40:3001` attempt from this dev machine timed out at the raw
TCP layer (confirmed with a bare `net.connect` probe, isolating it from any
WebSocket/TLS logic). Re-checking port 3000 — which had answered with an
explicit protocol-level rejection earlier this same session — now *also*
times out at the raw TCP layer. This is the same "silently dropped, zero
response" signature ADR-HEARTH-006 already identified as network isolation,
not device behavior. Conclusion: the "Pi 5 is connected to it" network
state from earlier this session was evidently not durable — this dev
machine's reachability to the `10.20.30.x` segment has reverted, not the
TV's protocol behavior. **This does not affect whether the fix actually
works**, since the real path (phone → Family Command Center's relay on the
Pi → TV) never routes through this dev machine at all; the dev-machine
script (`scripts/test-lg-connection.js`, updated today to use `wss://3001`
with `rejectUnauthorized: false` via the `ws` package, matching the relay's
own trust) was only ever a convenience cross-check, not the production
path. Genuine next step, not yet done: Sean attempting the real connection
from Hearth's own UI on his phone, which is the only way to test the actual
phone→relay→TV path this ADR is about.
