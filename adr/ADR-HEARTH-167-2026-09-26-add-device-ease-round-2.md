# ADR-HEARTH-167: Adding devices, ease round 2

Date: 2026-09-26. Status: accepted. Builds on ADR-HEARTH-148, 153, 154, 155, 156, 158.

Context: Sean asked that adding devices be easier and broader. Another agent owns breadth (new brands, no drivers here). This ADR covers ease only.

## Decisions

1. **Add all ready.** `addAllPlan.ts` splits recognized, online, unhidden rows into `auto` (ip-only, no approval) and `steps`. Steps are: LG/Samsung on-screen approval, inline keys (Sony PSK, Xbox), custom-screen pairing (Hue, PS5, Apple TV, SwitchBot, SmartThings), and any brand needing Family Command Center when it is not set up. `addAllRunner.ts` connects the `auto` rows one at a time (parallel connects would race on the Pi and sockets), never stops at a failure, reports per-row status and a one-line summary. A row that unexpectedly needs input is reported as a step, not lost. Bulk adds do not navigate to the post-add screen (`onAddedQuietly`); naming and wake test stay available from each device.
   - Q: which brands count as "needs approval"? A: an explicit id set (lg, samsung) in `addAllPlan.ts`; a new brand defaults to auto and, if it turns out to need input, falls into the failure/step path. Rationale: keeps the registry untouched by the breadth agent.
2. **Checklist, not a dead end.** Steps appear as "N need a quick step" with a Start button per device that runs the normal one-tap path for that row.
3. **Scan again.** Explicit "Scan again" in the status line, pull-to-refresh kept, and an automatic rescan when the app returns to the foreground (throttled to 15 s, never overlapping a running scan). While scanning the status shows "Scanning... N found so far" (the previous list stays visible), or a patience note after 6 s on a first scan. Limitation: the Pi endpoint answers in one response, so N is the known count, not a stream of partials.
4. **Remembered decisions.** Hidden and brand labels already persisted (ADR-153). Added `supportRequested` to the label so a reported device shows "Support requested" instead of asking again; it stays on the phone (not pushed to the Pi).
5. **Unrecognized is not a dead row.** Rows say "Looks like a camera. Not supported yet" with one-tap "Request support", which opens the system share sheet with a prefilled report (`unsupportedReport.ts`): kind, name, vendor, model, hostname, evidence, and only the MAC vendor prefix, never the full MAC or IP. Share sheet chosen over a clipboard package (none installed, no new dependency). Ports appear only if the Pi puts them in `evidence`.
6. **Scan a QR from Discover.** Footer link opens the existing scanner. `scannedQr.ts` now accepts a `hearth://pair` invite as well as the settings JSON; an invite opens the Join screen prefilled and still requires the confirmation dialog (ADR-160).
7. **Empty states explain why.** `discoverEmptyAdvice.ts`: nothing found lists Local Network permission, different Wi-Fi, sleeping devices, Pi off; unreachable leads with **Open Settings** (`Linking.openSettings`); rejected token leads with Family Command Center setup.
8. **Manual add picker.** Shared `BrandOptionList` (both the home Add-a-device list and the identify picker): search box, typo-tolerant matching (edit distance with adjacent swap, prefix, aliases in `brandSearch.ts` keyed by brand id), and a colored monogram tile per brand (`brandVisuals.ts`). No trademarked logo files are bundled; brands missing from the color map get a stable fallback color.

## Verification
Web harness scenarios added: `discover-add-all-running`, `discover-add-all-done`, `discover-unrecognized`, `brand-picker-search`; demo Discover now has 8 recognized devices with scripted connects. Pure logic covered by unit tests.

## Not done
Empty/failed-scan states are unit-tested but not screenshotted (demo network always succeeds). No streaming partial scan results. Support report is shared, not sent to a server.
