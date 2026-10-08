# ADR-HEARTH-225: The Command Center button opens the command center on the TV

## Status

Accepted

## Context

Sean, directly (2026-10-08): "command center button doesn't work. as you're fixing it, pull it up
on the lg tv."

The button added by ADR-HEARTH-213/216 only ran `checkFccReachableNow()` -- a health probe of the
Pi -- and then flashed "Reached" or "No Answer". It never put anything on the TV. It was built from
the request "a button on all of the TVs it can be called from", which was read as a connectivity
check; what Sean wanted was the command center shown on that TV.

The Pi already had the working piece: per-brand launchers that hand the TV's built-in browser the
command center (Pi adr/0274 LG, adr/0273 Sony) and the "Show on TV" action in Settings (adr/0275).
That action sits behind an owner/adult login a phone running Hearth does not have.

## Decision

- **New Pi route** `POST /api/integrations/hearth/show-command-center` (Pi adr/0284), bearer-token
  gated like every other hearth/* route, body `{ kind: "lg-webos" | "sony-bravia", ip }`. The
  address must be a private home-network IPv4, because this route is reachable through the public
  tunnel and the phone supplies the address.
- **`showCommandCenterOnTv(device)`** (`src/discovery/showCommandCenterOnTv.ts`) maps the device's
  driver to a launcher kind and posts its saved `ipAddress`.
- **The button** calls it for LG webOS and Sony Bravia. Labels now say what happened: "Opening…",
  "Opened", "Couldn't Open".
- **Samsung, Roku and the rest keep the old reachability check.** The Pi has no launcher for them,
  and claiming "Opened" for a TV nothing was sent to would repeat the original mistake.

## Consequences

- Pressing the button on the LG now switches that TV to the command center (the mirror page, per
  Pi adr/0274). Verified live on the downstairs LG from the Pi before the app change shipped.
- The button needs the Pi up; with the Pi down it reports "Couldn't Open".
- Needs an EAS update to reach the phones.
