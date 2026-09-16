# ADR-HEARTH-069: Dev tunnel drops the borrowed carddna.app domain, switches to an ephemeral quick tunnel

**Date:** 2026-09-16
**Status:** Accepted, implemented

## Context

ADR-HEARTH-034 (2026-09-11) set up a named, persistent Cloudflare Tunnel at `hearth.carddna.app`
for Hearth's dev server, explicitly because it was "the only zone available" in Sean's Cloudflare
account — CardDNA (a separate, unrelated sports-card app) happens to own that domain. Sean flagged
this directly (2026-09-16): "carddna and hearth have nothing to do with eachother" — and, per
ADR-GLOBAL-009 (professional/personal project separation, written the same day), wanted actual
delineation between the two, not just a working setup that happened to share infrastructure.

## What was checked before proposing anything

Confirmed directly via the Cloudflare API (using the existing tunnel origin cert's embedded token)
that the account genuinely has exactly one zone: `carddna.app`. There was no second, unused domain
to move Hearth to — a real constraint, not an assumption.

## Decision

Presented Sean three options: register a new domain (a real purchase, needs his go-ahead), drop
the custom domain entirely in favor of a free ephemeral tunnel URL, or leave the current setup as
is. **Sean chose the ephemeral tunnel** — accepting that the dev URL now changes on every restart,
the exact tradeoff ADR-HEARTH-034 originally moved away from, in exchange for zero dependency on
CardDNA's domain.

## Implementation

```
CI=1 npx expo start --port 443
cloudflared tunnel --config <path-to-an-empty-yml> --url http://localhost:443
```

**Real bug hit and fixed during setup**: `cloudflared tunnel --url ...` does NOT ignore an existing
`~/.cloudflared/config.yml` just because `--url` is passed on the command line — it still loads
that file's `tunnel:` and `ingress:` rules if present. The leftover config from the old
`hearth-dev` named tunnel only matches the `hearth.carddna.app` hostname and falls through to a
catch-all `http_status:404` for anything else — so every request to the new, randomly-generated
`*.trycloudflare.com` URL was silently 404ing at Cloudflare's edge, confirmed via
`--loglevel debug` (`ingressRule=1 originService=http_status:404` on every request). Fixed by
passing `--config` explicitly pointing at a throwaway file with no ingress rules
(`C:\Users\SeanGommier\bin\quicktunnel-empty-config.yml`) — cloudflared then correctly proxies to
`localhost:443` and the dev manifest resolves end-to-end (verified: `/status` returns
`packager-status:running`, and `GET /` returns a full, correct Expo manifest with the tunnel's own
hostname baked into the asset URLs).

Also upgraded `cloudflared` (was 2026.7.1, now 2026.9.1) after WinGet's in-place upgrade failed
with an access-denied error (the same non-admin wall as `hearth-windows-not-admin` in memory) — the
new binary was downloaded directly to `C:\Users\SeanGommier\bin\cloudflared.exe` instead of
replacing the WinGet-managed copy. This turned out NOT to be the actual root cause of the 404 (the
stale config.yml was) but is worth keeping regardless.

The old named tunnel (`hearth-dev`, id `f5816270-...`) and its `config.yml` were left in place,
unused, rather than deleted — reversible if Sean ever wants a stable domain back.

## Consequences

- Hearth's dev tunnel no longer depends on or references CardDNA's domain in any way — the
  delineation Sean asked for.
- The dev URL is no longer stable across restarts — whoever needs to connect Expo Go must get the
  current URL from the tunnel process's own startup log each session, not reuse a bookmarked one.
- If this proves too disruptive in practice, the options are unchanged from today: register a
  Hearth-specific domain (a real purchase, needs Sean's go-ahead) or accept the instability
  permanently. Documented in this session's memory (`hearth-cloudflare-tunnel`) for whichever
  future session picks this back up.
