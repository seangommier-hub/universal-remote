# ADR-HEARTH-081: iOS build credentials set up as local files via direct App Store Connect API calls, not EAS-managed remote credentials

**Date:** 2026-09-18
**Status:** Accepted, implemented; first real build succeeded

## Context

With the Apple Developer Program membership active (Team ID `ZR2575A26A`) and the App Store
Connect API key (`AuthKey_M8QMUJH79C.p8`, Key ID `M8QMUJH79C`, Issuer ID
`a6fa85c1-b373-40ab-a159-f3e03dd162e9`) provided by Sean, `eas build --profile development
--platform ios --non-interactive` still could not complete, for two separate reasons in sequence:

1. `eas-cli`'s interactive credential-setup flow requires a real TTY (to show its account/team/
   registration prompts) that isn't available in this session's automation tools — confirmed by
   testing plain Bash, PowerShell, and `winpty`, all of which either can't display the prompt at
   all or fail with "stdin is not a tty." Sean ran the interactive session himself for the parts
   that genuinely needed it (confirming the Expo account, the Apple Team ID, and the device
   registration link opened on his phone).
2. Even after Sean's interactive session created a distribution certificate and registered his
   device, a second, distinct problem emerged: EAS's "remote" credentials mode keeps its own
   server-side bookkeeping of which certificate/profile belongs to a project, separate from Apple's
   own live account state. Sean's interactive session got interrupted (an unexplained login page)
   before it finished creating the provisioning profile, and `--non-interactive` mode refuses to
   auto-select or create missing remote credentials — it only works when a complete, unambiguous
   set already exists in EAS's own records.

## What was actually done

Rather than keep retrying the interactive flow (blocked by the TTY problem) or asking Sean to debug
an unexplained browser login page, used the App Store Connect API key directly — the same one Sean
already generated as an App Store Connect "App Manager" role key with an explicit purpose (avoiding
ever needing his Apple ID password) — to query and create Apple resources directly via
`https://api.appstoreconnect.apple.com/v1`:

- Minted JWTs myself (ES256, signed with the `.p8` key, `aud: appstoreconnect-v1`) — no third-party
  JWT library needed, Node's built-in `crypto.sign` handles ES256 directly.
- Found the bundle ID `com.hearthremote.app` (ADR-HEARTH-080) already existed — created by Sean's
  earlier interrupted session.
- Found an existing "iOS Distribution: Sean Gommier" certificate also already existed from that
  same session, but **its private key isn't recoverable** — EAS generates that keypair locally
  during its own interactive flow and only the certificate's public half round-trips through
  Apple's API. Rather than treat this as a blocker, generated a **second, independent** distribution
  certificate (`openssl genrsa` + CSR + `POST /v1/certificates`) whose private key I hold end-to-end
  from generation — well under Apple's per-account distribution certificate limit.
- Registered device (`5F9432KX3Q`, Sean's iPhone, from his interactive `device:create` run) was
  already confirmed via `GET /v1/devices`.
- Created the ad-hoc provisioning profile (`POST /v1/profiles`) linking the bundle ID, the new
  certificate, and all currently-enabled devices — written as a small reusable script
  (`create_profile.js`) that re-queries "all enabled devices" each time, so re-running it after
  Sean's wife registers her phone regenerates a profile covering both without hand-editing IDs.
- Bundled the new certificate + its private key into a `.p12` (`openssl pkcs12 -export`), downloaded
  the profile as a `.mobileprovision`, and wrote a local `credentials.json` (Expo's documented
  local-credentials format) pointing at both files.
- Set `build.development.ios.credentialsSource: "local"` in `eas.json`, switching this one profile
  off EAS's remote credential bookkeeping entirely.
- `eas build --profile development --platform ios --non-interactive` then succeeded end-to-end with
  zero prompts, confirmed by "Using local iOS credentials (credentials.json)" in its own output.

## Consequences

- All generated secret material (`distribution.key`, `.p12`, `.mobileprovision`, `credentials.json`
  itself, and the whole `ios-credentials/` folder) is `.gitignore`d — confirmed via `git status`
  showing none of it as untracked before committing anything. None of it should ever be committed;
  if these files are ever lost, the fix is regenerating them the same way (a new cert + a new
  profile), not recovering old ones.
- The original EAS-managed "remote" certificate still exists on Apple's account, unused and with an
  unrecoverable private key on this machine — harmless (Apple allows multiple active distribution
  certs) but worth knowing it's there if Sean ever audits Certificates, Identifiers & Profiles.
  Likewise one orphaned profile (`ZF36Z6FDGA`, built against that unusable certificate) was created
  before this approach was settled on — safe to delete, not actively used by anything.
- Adding a new device (e.g. Sean's wife's phone) means: register it (`eas device:create`, still
  needs Sean's own interactive terminal for that one step), then re-run `create_profile.js` to mint
  a fresh profile covering every currently-enabled device, then rebuild — no credentials.json changes
  needed since it already points at the same file paths, only their contents change.
- This pattern (mint a JWT from the `.p8` key, call App Store Connect API directly, write local
  credentials.json) is the durable fallback whenever `eas-cli`'s own interactive flow can't run in
  this environment — worth remembering for any future Hearth iOS credential work, not just this one
  session.
