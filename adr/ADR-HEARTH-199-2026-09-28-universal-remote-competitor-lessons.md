# ADR-HEARTH-199: Lessons from Harmony, SofaBaton, Caavo and app-only universal remotes

**Date:** 2026-09-28
**Status:** Accepted policy (items 1-2 below) plus a roadmap (item 3). Sean's instruction: "do deep research on other apps that have the same functionality... implement anything positive."

## Context
Two research rounds covered the hardware-hub universal remote category (Logitech Harmony, SofaBaton, Caavo) and app-only/native remotes (Broadlink, Sure Universal Remote, Roku/Samsung/LG/Apple TV/Fire TV apps). Full citations are in the research; this ADR records what's adopted and why.

## What already holds, confirmed by this research
- **Live per-step progress during a run.** `activityRunner.ts`'s `onProgress` callback is wired end to end (`useActivities.ts` → `DeviceListScreen`/`ActivityEditorScreen`'s progress text, with a cancel option). A run never goes silent — this is exactly the "no graceful degradation" failure Harmony and SofaBaton reviewers cite, and Hearth already avoids it.
- **Per-step failure attribution after a run.** `ActivityRunModal` + `ActivityResultsCard` show which step failed and on which device, with a retry-failed action, not just a final pass/fail.
- **No proprietary hub to discontinue.** Hearth's Pi is commodity hardware the household owns outright, not a vendor SKU Logitech-style that can be end-of-lifed. Worth stating explicitly rather than leaving implicit.
- **No cloud account required for local control.** Unlike Broadlink (cloud login required even for local scenes) and Caavo (subscription-gated core features), Hearth's LAN-first design needs no account for local devices.

## Decision 1: core device control and Activities are never paywalled
Whatever Hearth's future looks like (a relay tier, a cloud add-on, anything), running a device or an Activity a household already owns/paired never sits behind a subscription. This is the single clearest lesson from Caavo's collapse (universal search/voice required a recurring fee, and the product disappeared from retail) and matches Sean's own stated preference this session against subscriptions and "signing up" for things.

## Decision 2: local control must never depend on a cloud flag that can be flipped remotely
Logitech remotely disabled Harmony Hub's local API by firmware push in 2018 before public pressure reversed it — the read is that a device the household controls entirely over its own LAN must keep working even if every one of Hearth's own cloud dependents (Expo Update servers, the Cloudflare tunnel, Home Assistant's own cloud) goes dark. This already holds for LAN-only drivers; it's now a standing constraint for anything new.

## Roadmap: genuinely new, not yet built
1. **A default "All on" / "All off" Activity, offered at setup** rather than left purely user-authored — the one thing every hub-based competitor ships as a baseline and Hearth doesn't yet generate automatically. Size S.
2. **Voice dictation into the Home Assistant Assist text box** (and any future search field), using iOS's own dictation rather than building a voice stack — closes the single largest input-method gap versus native remotes, without needing OS-level assistant access. Size M.
3. **Setup wizard language modeled on Harmony's**: plain-language questions about the system instead of protocol jargon, with advanced per-step timing hidden behind an "advanced" toggle — an editor copy/UX pass, not new capability. Size M.

## Explicitly not chasing
Private listening/headphone streaming (native OS audio-path access Hearth can't get as a third-party app); true assistant-level voice search across every app (needs platform-owner content metadata); a VNC-style generic "trackpad" over arbitrary TVs (conflates the Pi kiosk's own VNC input with TV control — Android TV/Google TV already has real d-pad navigation through its own driver, which is the correct mechanism, not a workaround).

## Consequences
Decisions 1-2 are policy, effective immediately, no code change. Roadmap items are unstarted; item 1 is the next one built.
