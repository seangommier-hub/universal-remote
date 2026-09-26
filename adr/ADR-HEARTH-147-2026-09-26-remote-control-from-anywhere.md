# ADR-HEARTH-147: Control devices from anywhere through one LAN-then-public Family Command Center client

Date: 2026-09-26
Status: Accepted

## Context
Sean: "for Hearth to be truly useful it should be able to control things even when NOT on the home network." The phones reach devices through the Raspberry Pi (Family Command Center, FCC). ADR-HEARTH-123/125/126 added a public Cloudflare Tunnel address (`publicBaseUrl`) but only some code paths used it; the rest called `${config.baseUrl}` (a 192.168.x.x address) directly and silently failed away from home. Every request also paid a full LAN timeout before any fallback.

## Decision
- `src/core/network/fccRequest.ts` `fccFetch(config, path, init, timeoutMs)`: the single client for direct FCC calls. Tries LAN then public, falls through only on "could not reach" (network error or timeout). Any HTTP response, including 401, 4xx and 5xx, is returned untouched and never retried elsewhere. Bounded by `fetchWithTimeout`. Total failure throws `FccUnreachableError` (message and `cause` preserved; `isFccTimeout` classifies timeouts).
- `src/core/network/fccJsonRequest.ts`: the shared JSON helper that replaced four copy-pasted `fccRequest` functions (Ps5, AppleTv, Chromecast, Broadlink); same error messages.
- `src/core/network/fccConnectivity.ts`: in-memory route memory. LAN failure followed by public success means mode `away`; a LAN success means `home`. While away and the LAN failed within `AWAY_MEMORY_MS` (5 min), requests go public first; after that the LAN is probed again, so coming home switches back on the next request. Exposes read-only `getConnectivityMode()`, `subscribeConnectivityMode()`, `shouldPreferPublicRoute()`.
- Direct device attempts (4s each) are skipped in both relay fallbacks when away and the target is a private address (192.168/16, 10/8, 172.16/12): `httpRelayFallback.ts` and `wsRelayFallback.ts`. Both relays now use the shared route memory; the WS relay goes public-first when away.
- UI: the remote page appends " · Remote" to the existing manufacturer/model line (no added height); the device list subtitle reads "Remote — away from home" while away. VNC screen tries the public relay first while away.
- Tests: `fccRequest.test.ts`, `remoteFromAnywhere.test.ts`.

## Call-site audit (file:line before this change, `git show 3fbeab8`)
Worked away before (own hand-rolled LAN-then-public): `httpRelayFallback.ts` callRelay, `wsRelayFallback.ts` openSocketWithRelayFallback, `familyCommandCenterDeviceSync.ts` syncRequest, `familyCommandCenterBump.ts` bumpDevices, `familyCommandCenterClientLog.ts` postClientLogBatch, `CommandCenterRemoteScreen.tsx` VNC. All now use the shared client or route memory (VNC only the ordering).

Did NOT work away (LAN only), now fixed: `wakeOnLan.ts` sendWakeOnLan (power-on), `Ps5Client.ts` fccRequest, `AppleTvClient.ts` fccRequest, `ChromecastClient.ts` fccRequest, `BroadlinkClient.ts` fccRequest, `KasaClient.ts` fccRequest, `SmartThingsClient.ts` fccRequest, `XboxDriver.ts` executeCommand (power on), `familyCommandCenterDeviceLookup.ts` fetchLanDevices (IP self-heal), `FamilyCommandCenterDiscoveryProvider.ts` scan, `SsdpDiscoveryProvider.ts` runFccFallbackScan.

Route through the two relays (so work away): Sonos, Squirrel Feeder, Hue, Roku, Denon, Sony Bravia and IRCC, Yamaha, Samsung (HTTP and WS), LG (WS). SwitchBot uses the vendor's public cloud API and never needed the LAN.

## Remaining gaps
- `verifyAndSaveFamilyCommandCenterConfig` / `verifyAndSavePublicUrl` (pairing checks) hit exactly the address being verified, by design.
- The native SSDP/multicast scan and any pairing that needs the phone physically on the same network are LAN-only by nature; away, discovery relies on FCC's own scan.
- Away mode is only learned from real traffic; it shows "unknown" until the first FCC call after launch. The public tunnel is ephemeral (see memory note), so away control works only while that hostname is live and saved in Settings.
- Public relay depends on the `hearth-relay.` / `hearth-ws.` / `hearth-vnc.` hostname convention (ADR-HEARTH-123/125).
- A public 5xx from an unhealthy tunnel is treated as a real rejection, not "unreachable".
