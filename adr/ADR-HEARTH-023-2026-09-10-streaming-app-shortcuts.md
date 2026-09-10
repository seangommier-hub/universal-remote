# ADR-HEARTH-023: Streaming app shortcuts (Netflix, Hulu, Prime Video, YouTube)

**Date:** 2026-09-10
**Status:** Accepted

## Context

Sean asked for shortcuts to Prime, YouTube, Netflix, and Hulu on the main
remote screen "with their logos," then sent three AI-generated concept
images (not literal specs — "it does not need to be exactly this but you
will understand") showing a Streaming Apps row with real branded tiles
sitting below the d-pad, above the utility row.

Verified each protocol's actual app-launch capability before building
anything, same standard as ADR-HEARTH-022:

- **Roku ECP**: real, documented `POST /launch/<channel id>` endpoint.
  Roku doesn't publish a channel-ID reference in its own docs, but the
  ids for these four are stable and widely corroborated:
  Netflix = `12`, Amazon Prime Video = `13`, Hulu = `2285`,
  YouTube = `837`.
- **LG webOS SSAP**: real `ssap://system.launcher/launch` endpoint,
  payload `{ id: "<appId>" }`. `netflix` and `youtube.leanback.v4` are
  documented directly in `hobbyquaker/lgtv2` (this codebase's existing
  reference for the whole LG driver); `amazon` and `hulu` are corroborated
  across multiple independent community sources but not that primary
  reference itself — flagged in code as slightly less certain.
- **Samsung Tizen**: no app-launch capability at all — the protocol is
  key-press emulation only, confirmed by its own documented key list.
- **Sony BRAVIA REST API**: not verified either way; not implemented.

## Decision

- `CapabilityId` gains `"launchApp"`; new `StreamingService` union
  (`netflix` | `hulu` | `primeVideo` | `youtube`).
- `RokuEcpClient.launchChannel(channelId)` — new method, same
  `requestWithRelayFallback` POST pattern every other Roku command uses.
  `RokuEcpDriver` maps `StreamingService` → the real channel ids above.
- `LgWebOsDriver`'s `applyCommand` gains a `launchApp` case calling
  `client.call("ssap://system.launcher/launch", { id: appId })` through
  the existing generic `call()` method — no new client method needed.
- `UniversalTvRemote.tsx`: a "Streaming Apps" card, gated on
  `has(device, "launchApp")`, rendered below the d-pad hub and above the
  utility row — matching the reference images' own placement. Four
  colored tiles (`StreamingAppTile`), one per service.
- **No bundled logo image assets** — this app has no image/asset pipeline
  for third-party trademarked artwork, and fetching real logo files
  wasn't attempted. Each tile uses that service's real, public brand
  identity color (background + accent, e.g. Netflix black-and-#E50914,
  Hulu's #1CE783 green) with a styled wordmark `Text`, except YouTube,
  which uses Ionicons' own bundled `logo-youtube` glyph since that ships
  with the app already — confirmed present in the installed icon set
  before using it, not assumed.

## Rationale

Brand colors are a much lower-stakes thing to reproduce than logo artwork
itself — recognizable, not a copy of a protected mark. This is a
pragmatic stand-in given the actual constraint (no real asset files
available), not a design preference; if real logo assets are supplied
later, swapping them in is a `StreamingAppTile` prop change, not a
rearchitecture.

Samsung/Sony not declaring `launchApp` is the same discipline as
ADR-HEARTH-022: verified capability per protocol, not a button that's
silently broken on drivers that can't back it.

## Consequences

- 109/109 tests passing (6 new: `RokuEcpClient.launchChannel` success/
  failure, `RokuEcpDriver` mapping "netflix"→"12" and rejecting an
  unsupported service without touching the network, the equivalent pair
  for `LgWebOsDriver`), `tsc --noEmit` clean.
- Not yet verified against a real Roku or LG TV — the mock-driven tests
  prove the wire format matches each protocol's own documentation, not
  that launching actually opens the named app end-to-end. Next real
  checkpoint: Sean tapping one of these tiles on his actual LG TV.
- The `amazon`/`hulu` LG app ids specifically carry more uncertainty than
  `netflix`/`youtube.leanback.v4` (see Context) — worth watching first if
  something doesn't launch.
