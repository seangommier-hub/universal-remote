# ADR-HEARTH-149: Invite codes and first-run setup

Date: 2026-09-26
Status: Accepted

## Context
A new household member (Leah's real case) could only connect by scanning a camera QR or typing an address plus a 48-character token, and the address field was prefilled with one household's LAN IP. A QR scan once failed on a real phone and hand-typing was the only fallback. The empty Devices screen said nothing about the server.

## Decision
- **Invite codes.** A connected phone asks Family Command Center (FCC) for an 8-character code (`POST /api/integrations/hearth/pair/code`, bearer). A new phone trades it (`POST /api/integrations/hearth/pair/redeem`, no bearer) for `{ baseUrl, publicBaseUrl, token }`, then saves through the existing verify-and-save helpers. Shared as `hearth://pair?code=<CODE>&server=<publicBaseUrl or baseUrl>` via the iOS share sheet.
- **Deep link.** `usePairLinkListener` (expo-linking, cold start and while running) redeems automatically and reports the result in an alert. Added `expo-linking` (ships with SDK 57, already a transitive dependency) as a direct dependency.
- **Server candidates** tried in order: the link's `server`, saved LAN address, saved public address, then `https://hearth-relay.carddna.app` (last resort so a typed code works away from home). A wrong-code or lockout answer stops the search; unreachable moves on.
- **Away from home** the LAN address cannot be verified, so the token is verified over the public host and the LAN address is still saved.
- **Failures.** Wrong/expired/used -> one plain message; 429 -> "Too many tries, wait 10 minutes"; unreachable -> the ADR-142 network-failure notice.
- **First-run card.** Empty Devices shows "Connect to your home" (Join with a code / Scan QR) when no server is saved; otherwise the normal add-device prompt.
- **Public URL auto-learn.** After a QR pair or join, and at app start, if configured with no public URL, fetch `GET /api/integrations/hearth/connection-info` once and save it. Silent on any failure. Not run after the settings-screen save, so a deliberately cleared public URL is not fought.
- **Removed** the Sean-specific `http://192.168.1.172:3210` prefill; placeholder is `http://192.168.x.x:3210`.
- **QR of the invite link: skipped.** No QR-rendering library exists in package.json (only camera scanning via expo-camera); none was added unvetted. The code plus Share link cover the case.

## Security reasoning
The code is short-lived (10 minutes), single-use, and the server locks out repeated wrong guesses. The long-lived token never appears in the link or code; it travels only in the redeem response, over TLS when redeemed remotely (the public host is HTTPS). Redeem sends no credentials. The code is not logged.

## Dependencies
Requires the Pi endpoints (`pair/code`, `pair/redeem`, `connection-info`) to be deployed; until then invites fail with a network/server error and auto-learn is a silent no-op.
