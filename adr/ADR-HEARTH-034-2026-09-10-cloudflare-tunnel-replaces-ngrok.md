# ADR-HEARTH-034: Persistent Cloudflare tunnel replaces Expo's ngrok tunnel

Date: 2026-09-10

## Status

Accepted.

## Context

Sean: "no ngrok issues ever." `expo start --tunnel` uses ngrok, which has
had documented intermittent connection blips throughout this whole
project ("Tunnel connection has been closed... Restart the dev server")
— usually self-healing within seconds, but a real, recurring annoyance,
and its free-tier reliability isn't something any client-side
configuration can fix.

The actual reason a tunnel is needed at all: Sean's Windows account is
not a local admin on this AzureAD-joined machine
([[hearth-windows-not-admin]]), and two `node.exe` inbound-block Firewall
rules are already in place — confirmed directly (`Disable-NetFirewallRule`
fails with "Access is denied") — which is what would otherwise let
Metro's LAN mode talk to the phone directly, tunnel-free. That's the real
fix, but it needs IT/an admin account, not something fixable from here.

Sean pointed at an existing resource instead of asking to escalate to
IT: "you have my cloudflare account." `cloudflared` was already installed
(via winget) but never authenticated on this machine. Authenticated it
using Sean's already-logged-in Chrome session (GitHub OAuth — his
Cloudflare account isn't linked to Google, confirmed by trying that
first) rather than any password entry.

## Decision

Created a **named, persistent Cloudflare Tunnel** (`hearth-dev`, id
`f5816270-e273-41b5-97d4-147bd554bbc4`) under the only zone available in
Sean's account, `carddna.app` (his other project's domain — no
Hearth-specific domain exists) — routed at `hearth.carddna.app`. This
is Cloudflare's production tunnel product, not the anonymous "quick
tunnel" (which has similar free-tier reliability characteristics to
ngrok) — tied to a real account and zone, with a stable hostname that
does **not** change between restarts, unlike ngrok's random subdomain
each time `expo start --tunnel` runs.

Config lives at `C:\Users\SeanGommier\.cloudflared\config.yml`:
```yaml
tunnel: f5816270-e273-41b5-97d4-147bd554bbc4
credentials-file: C:\Users\SeanGommier\.cloudflared\f5816270-e273-41b5-97d4-147bd554bbc4.json
ingress:
  - hostname: hearth.carddna.app
    service: http://localhost:443
  - service: http_status:404
```

**To bring this up in a future session** (replaces the old
`CI=1 npx expo start --tunnel --clear --port 8081` pattern):
```
CI=1 npx expo start --port 443          # Metro, in its own terminal/background task
cloudflared tunnel run hearth-dev        # the tunnel, in a separate background task
```
Metro must run on port 443 specifically — same reasoning already
established earlier in this project (LG-encrypted-port investigation
session): Expo's manifest embeds whatever local port Metro is bound to
into the bundle URL, and the ingress rule above forwards
`hearth.carddna.app` (HTTPS, port 443 implicitly) straight to
`localhost:443`. Verified end-to-end: manifest fetch and full bundle
download both succeed through `https://hearth.carddna.app`.

The QR code changes from `exp://<random>.exp.direct` to
`exp://hearth.carddna.app:443` — **sent once, should not need
regenerating on future restarts** unless the tunnel itself is recreated.

## Consequences

- Not literally "zero issues ever" — no tunnel provider can promise that,
  and this ADR doesn't claim it. What it does fix: no more random
  subdomain on every restart, and Cloudflare's named-tunnel product is
  generally more reliable at the free tier than ngrok's, since it's not
  an anonymous ephemeral tunnel.
- The tunnel now lives under `carddna.app`, a different project's domain
  — a real, visible coupling worth knowing about if that domain's DNS or
  Cloudflare zone ever changes for CardDNA's own reasons. Not expected to
  cause problems (`hearth.carddna.app` is just one more CNAME on that
  zone), but noted so it's not a surprise later.
- If the real fix (removing the Firewall block via IT/an admin account)
  ever happens, this tunnel becomes unnecessary — LAN mode
  (`npx expo start`, no tunnel at all) would then be the simpler, faster,
  even-more-reliable option. Don't forget this Cloudflare tunnel exists
  and keep defaulting to it if that constraint is ever lifted.