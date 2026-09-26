# ADR-HEARTH-154: Guided post-add setup checklist and wake test

**Date:** 2026-09-26
**Status:** Accepted, implemented; wake behaviour needs real-device verification

## Context

Adding a device takes one tap (ADR-HEARTH-148/149), but "added" is not "works well". Sean's two biggest
real complaints were that devices cannot be turned on from off (Wake-on-LAN needs specific TV settings
and a known MAC) and that connections are not persistent. The connection-reliability research listed
per-brand settings that decide whether wake works.

## Decision

- Adding a device now opens a **post-add screen** (name field, "Share with the household" switch,
  default OFF per ADR-HEARTH-140, and a "Make it turn on from off" checklist) instead of jumping
  straight to the remote. Its primary button is "Done - open remote".
- `src/discovery/brandSetupChecks.ts` is a pure data table of per-brand checks (LG, Samsung, Sony,
  Roku, Apple TV, Xbox, PS5, plus the iOS Local Network permission on iOS only). Each check has id,
  title, why, where-to-find, and either an automatic verifier (`mac-known`, `fcc-reachable`,
  `device-answers`) or is a manual tickbox. Only settings true for that brand are listed. A device with
  no `powerOn`/`power` capability, or a brand without an entry, gets no checklist.
- A **guided wake test** sends power-on the way the Power button does (`powerOn`, else `power`, via
  `CommandEngine`) and watches the StateStore connection for 60 s with a live countdown. Success reports
  "Woke in N s"; a timeout shows the brand's specific likely cause with a "Show me how" button that
  expands every check's settings path. It refuses to start while the device already looks connected.
- The result is stored in a separate AsyncStorage map (`hearth.wakeTested`), never on the Device.
- Existing devices reach the same screen from the device list's long-press menu ("Setup checks",
  shown only when checks exist). UniversalTvRemote.tsx is untouched.
- The logic lives in small modules: `WakeTestRunner.ts` (state machine, injectable deps),
  `PostAddAutoChecks.ts`, `WakeTestStore.ts`, `PostAddChecklist.tsx`, `WakeTestPanel.tsx`,
  `PostAddScreen.tsx`.

## Consequences

- Manual ticks are per-visit and not persisted; only the wake-test success is.
- The "still on" guard relies on the driver reporting a truthful connection state; a stateless device
  (for example a Roku that always answers) may refuse to start until its state reads disconnected.
- Family Command Center reachability is measured with the same authenticated device-list call used when
  saving its address.
