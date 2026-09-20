# ADR-HEARTH-107: Every `eas update` this session went to the wrong branch — nothing shipped actually reached Sean's phone

**Date:** 2026-09-20
**Status:** Accepted, fixed

## Context

Sean, directly, after being told Wake-on-LAN/Broadlink were "shipped" and "live": "but we haven't
been using test flight. also, i thought you made it so that the tvs could be turned on. why
doesn't the connection persist?" — a real bug report that turned out to have nothing to do with
the Wake-on-LAN code itself.

Root cause, confirmed via `eas channel:list`/`eas branch:list`, not guessed:

- Sean's actual installed app is a `preview`-profile build (`com.hearthremote.app`, ad-hoc
  internal distribution, per ADR-HEARTH-082 — this is the "install it and use it" pattern he's
  actually used all along).
- That build only ever receives updates via EAS Update's `preview` **channel**, which is linked to
  a branch also named `preview`.
- Every `eas update` command run this session used `--auto`, which infers the target branch from
  the current **git** branch name — `main` in this repo. **`main` is a completely different,
  unrelated EAS Update branch that was never linked to any channel at all.**
- Result: the Wake-on-LAN (ADR-HEARTH-102) and Broadlink (ADR-HEARTH-103) OTA pushes both went to
  the orphaned `main` branch. `preview` branch's last real update was 16 hours earlier (the PS5
  OAuth rework, before this session's work). **Nothing shipped today via `eas update` ever reached
  Sean's phone** — not a bug in the Wake-on-LAN driver (which was verified thoroughly against the
  real Family Command Center backend), just code that was never delivered at all. The Apple TV OTA
  push was never even attempted (session paused for cross-session coordination before reaching it),
  so that one's absence was at least consistent, not misleadingly reported as "shipped."

Separately, real diagnosis was needed for why the TestFlight submission (ADR-HEARTH-106) was also
the wrong move: `production` profile builds a **different app entirely**
(`com.seangommier.hearthapp`, a distinct bundle identifier, per ADR-HEARTH-083) from the one Sean
actually has installed. Even after Apple finished processing that build, installing it via
TestFlight would not have updated his existing app — it would have added a second, separate app.
Sean confirming "we haven't been using TestFlight" was the direct signal this whole distribution
channel was a wrong assumption, not just an unfinished step.

## Decision

- Built a fresh `preview`-profile iOS build (`286617f1-14ee-4acb-8472-97444c9dbcd1`) — this bundles
  the JS at build time, so it carries everything from today (Wake-on-LAN, Broadlink, Apple TV,
  squirrel feeder/tab-navigation) directly into the binary, with zero dependency on the broken OTA
  path. Delivered as a direct install link/QR code, matching Sean's actual established install
  pattern (ADR-HEARTH-082) — not TestFlight.
- **Going forward, every `eas update` for this project must pass an explicit `--branch preview`**
  (or whatever branch a future channel audit confirms is actually linked to Sean's installed
  build) — never `--auto`. `--auto`'s git-branch-name inference is a real footgun in this specific
  repo, where the git branch (`main`) happens to share no relationship with EAS Update's own
  branch/channel model.
- The stray TestFlight submission (build #3, `com.seangommier.hearthapp`) is harmless and left
  alone — a separate, unused app under a bundle identifier Sean doesn't install from. No cleanup
  needed unless Sean wants that App Store Connect record's build history tidied up later.

## Consequences

- **Every prior claim this session that Wake-on-LAN or Broadlink was "shipped," "live," or "on your
  phone" was wrong** — they were real, tested, working code sitting in a git repo and an orphaned
  EAS Update branch, never actually delivered to any installed build. This ADR is the correction.
- The new `preview` build (once Sean installs it via the link) is the first build this session that
  actually contains today's driver work in a way reachable from his phone.
- This is a real process gap worth remembering for every future session on this project: "shipped
  via `eas update`" must mean "published to the branch the target channel is actually linked to,"
  confirmed via `eas channel:list`, not assumed from a successful-looking CLI output. A clean CLI
  exit and a real device receiving the update are not the same claim.
