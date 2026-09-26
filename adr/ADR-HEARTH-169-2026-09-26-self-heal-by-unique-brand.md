# ADR-HEARTH-169: Self-heal a moved device by the unique unclaimed device of its brand

**Date:** 2026-09-26
**Status:** Accepted and built.

## Context

Real bug found live 2026-09-26: Sean's saved "Den TV" (Sony Bravia, no saved `hwaddr`, saved IP 192.168.1.217) went stale
after DHCP moved it to 192.168.1.50. The Pi's inventory names it `sonytv.lan`, so the name fallback (ADR-HEARTH-126)
matched nothing and the device never healed; the relay returned HTTP 502 forever. MAC, UUID and name all need an
identity the device may simply not have on file.

## Decisions

1. **`findCurrentIpByBrand(brandId, { excludeIps })`** in `familyCommandCenterDeviceLookup.ts` reads the Pi's
   `discover/all` rows and returns an IP only when exactly one online, non-hidden device of that brand
   (`labelBrand ?? brand`) exists whose IP is not in `excludeIps`. Zero or two-plus candidates, an unconfigured Pi or an
   unreachable Pi all return `undefined`. It never guesses between two devices.
2. **`excludeIps` is every other saved device's `ipAddress`**, so a second TV of the same brand that is already saved
   can never be mistaken for the moved one.
3. **Only for devices with no saved `hwaddr`.** A device with a MAC is located by MAC alone; if the Pi does not see
   that MAC, the device is off, and adopting some other same-brand device would be wrong.
4. **One shared helper, `src/drivers/shared/selfHeal.ts`** (`findMovedAddress`, `backfillHwaddr`) replaces the
   duplicated lookup and MAC-backfill blocks in the LG, Samsung, Sony, Roku, Denon, Yamaha, Chromecast, Sonos, Apple TV,
   Kasa and Android TV drivers and `PerRequestDriver` (Vizio, Wiz, LIFX, Shelly). Order: MAC, UUID, name, brand. On
   success the existing code persists the new IP and the helper backfills `hwaddr` via `findMacByIp`, so the next move
   uses the precise MAC lookup. `findCurrentIpByIdentity` was removed (superseded by the helper).
5. **Cycle avoidance.** The brand registry imports every driver, so drivers cannot import it. Bootstrap registers the
   saved-device list and the driver-to-brand map once through `selfHealContext.ts` (`setSelfHealContext`), and the
   lookup reads `discover/all` directly rather than importing `discoverAll.ts`.
6. Hue is unchanged (it heals its bridge by MAC only).

## Consequences

- A TV added without a MAC heals itself when it is the only one of its brand on the network not already saved. With two
  unsaved same-brand devices it still does not heal, by design.
- Tests: `findCurrentIpByBrand` (unique, two candidates, claimed by another saved device, unreachable, unconfigured,
  offline/hidden) and `selfHeal.test.ts`; existing driver test mocks gained `findCurrentIpByBrand`, and the LG
  name-fallback test flushes more microtasks because the lookup path is one hop longer.
- Not exercised against the live Den TV in this change.
