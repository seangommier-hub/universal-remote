# ADR-HEARTH-146: Ship warn/error logs to Family Command Center for remote diagnosis

Date: 2026-09-26
Status: Accepted

## Context
Debugging the household phones (Sean's and Leah's) required plugging them into a PC over USB and reading the iOS syslog. Both phones already talk to the Raspberry Pi Family Command Center (FCC), so each can quietly send its own recent problems there.

## Decision
- `src/core/logging/logBuffer.ts`: in-memory ring buffer (300 entries, warn and error only), fed by `logger.ts` without changing the logger's API or console output. Each entry carries a monotonic sequence number.
- `src/core/logging/redact.ts`: pure redaction applied before anything is sent. Meta keys matching token, psk, clientKey, secret, password, authorization, apiKey, credential, bearer, cookie, pairing or privateKey have their value replaced with `[redacted]`, at any nesting depth. Message text and string values are scrubbed for `Bearer ...` and `key=value` / `"key":"value"` secrets. Depth, array, key count and string length are capped; Errors are reduced to name and message. Conservative by design: a false positive only costs detail.
- `src/discovery/familyCommandCenterClientLog.ts`: `POST {baseUrl}/api/integrations/hearth/client-log` with the FCC bearer token, body `{clientId, appVersion, platform, entries[]}`. Same LAN-first, public-fallback-only-if-unreachable approach and 8s timeout as the device-sync client. `clientId` is a random UUID generated once per install and kept in AsyncStorage.
- `src/runtime/clientLogShipper.ts`: at most one send per 60s, only if there are unsent entries and FCC is configured, max 200 entries per request (newest kept, older dropped), each entry sent at most once. A failure keeps the entries and waits for the next interval (no retry storm) and is logged at debug level only, so the shipper cannot feed itself. Never throws into app code. Runs from `App.tsx` while the app is in the foreground and flushes when it returns to the foreground. No UI.

## Privacy
- Sent: timestamp, level, scope, redacted message, redacted meta, app runtime version plus update id prefix, platform, and a random per-install ID. Device names, IP addresses and error text can appear in log lines because they are useful for diagnosis; this is a household-only server.
- Never sent: the FCC token (used only as the Authorization header) and device pairing keys, which are redacted by key name and by text pattern.
- Opt-out is not built yet. Sending stops when FCC is unconfigured. A settings switch is a future item.
- The Pi is expected to store the lines under a rotating file (its own contract, built separately).

## Consequences
Remote diagnosis without a cable. Cost: log lines leave the phone to the household server. Redaction is pattern-based and cannot catch a secret with an innocuous key name and no recognizable text shape.
