// SSDP (Simple Service Discovery Protocol) discovery — real, native, zero-Pi-dependency device
// finding (ADR-HEARTH-095, 2026-09-19). Sean, directly: "the pi5 and command center are a
// symbiotic supplement to Hearth" — not something core discovery should be gated behind.
// Search targets verified against each brand's own real protocol docs/reference client (same
// sourcing discipline as every driver in this project), NOT guessed:
//  - Roku: `roku:ecp`, documented directly (developer.roku.com/dev/docs/external-control-api).
//  - LG webOS: `urn:lge-com:service:webos-second-screen:1`, confirmed via openHAB's lgwebos
//    binding — SSDP only *finds* the TV here, control still goes through LgWebOsClient's own
//    SSAP WebSocket handshake exactly as before.
//  - Samsung Tizen: `urn:samsung.com:device:RemoteControlReceiver:1`.
//  - Sony BRAVIA: `urn:schemas-sony-com:service:IRCC:1`.
//  - Yamaha MusicCast: no MusicCast-specific ST exists — uses the generic
//    `urn:schemas-upnp-org:device:MediaRenderer:1` filtered by a "Yamaha" SERVER/response string.
//    Lower-confidence than the other four; matches this project's own established pattern of
//    flagging a weaker signal honestly (see FamilyCommandCenterDiscoveryProvider.ts's own Kasa
//    matcher comment) rather than hiding the uncertainty.
//  - Kasa (TP-Link): NOT SSDP at all — its legacy protocol uses its own UDP broadcast/encryption
//    scheme. Not attempted here; stays FCC-only (or manual add) until a real Kasa-specific
//    discovery mechanism is researched.
//
// M-SEARCH responses arrive as unicast UDP sent directly back to this socket's own port — no
// multicast group membership (addMembership) is needed, only for the outbound send to
// 239.255.255.250:1900 and for receiving the point-to-point replies that follow.
//
// iOS: raw multicast is gated behind the `com.apple.developer.networking.multicast` entitlement
// (declared in app.config.js) AND a separate manual Apple approval Sean must request himself —
// until granted, sends here are expected to fail (caught, never throws) the same as any other
// "nothing found" case. Android has no equivalent restriction once
// CHANGE_WIFI_MULTICAST_STATE (already declared) is granted.

import dgram from "react-native-udp";
import { DiscoveredDevice, DiscoveryProvider } from "../core/discovery/DiscoveryProvider";
import { DeviceCategory } from "../core/types/Device";
import { SONY_BRAVIA_DRIVER_ID } from "../drivers/tv/sony/SonyBraviaDriver";
import { SAMSUNG_TIZEN_DRIVER_ID } from "../drivers/tv/samsung/SamsungTizenDriver";
import { LG_WEBOS_DRIVER_ID } from "../drivers/tv/lg/LgWebOsDriver";
import { ROKU_ECP_DRIVER_ID } from "../drivers/streaming/roku/RokuEcpDriver";
import { YAMAHA_MUSICCAST_DRIVER_ID } from "../drivers/tv/yamaha/YamahaMusicCastDriver";

const SSDP_MULTICAST_ADDRESS = "239.255.255.250";
const SSDP_PORT = 1900;
// MX (max wait, seconds a responder should randomize its reply over) — SSDP spec caps this at 5;
// the actual scan window below waits a little past this to catch late replies.
const SEARCH_MX_SECONDS = 3;
const SCAN_WINDOW_MS = (SEARCH_MX_SECONDS + 1) * 1000;

interface SearchTarget {
  st: string;
  manufacturer: string;
  category: DeviceCategory;
  driverId: string;
  // Only for the generic MediaRenderer target (Yamaha) — requires the response itself to also
  // mention the manufacturer, since the ST alone doesn't identify the brand.
  requireServerMatch?: RegExp;
}

const SEARCH_TARGETS: SearchTarget[] = [
  { st: "roku:ecp", manufacturer: "Roku", category: "streaming", driverId: ROKU_ECP_DRIVER_ID },
  { st: "urn:lge-com:service:webos-second-screen:1", manufacturer: "LG", category: "tv", driverId: LG_WEBOS_DRIVER_ID },
  { st: "urn:samsung.com:device:RemoteControlReceiver:1", manufacturer: "Samsung", category: "tv", driverId: SAMSUNG_TIZEN_DRIVER_ID },
  { st: "urn:schemas-sony-com:service:IRCC:1", manufacturer: "Sony", category: "tv", driverId: SONY_BRAVIA_DRIVER_ID },
  {
    st: "urn:schemas-upnp-org:device:MediaRenderer:1",
    manufacturer: "Yamaha",
    category: "tv",
    driverId: YAMAHA_MUSICCAST_DRIVER_ID,
    requireServerMatch: /yamaha/i,
  },
];

/** Extracts one HTTP-style header value from a raw SSDP response ("KEY: value\r\n..."). Exported for direct unit testing. */
export function extractSsdpHeader(response: string, header: string): string | undefined {
  const match = new RegExp(`^${header}:\\s*(.+)$`, "im").exec(response);
  return match?.[1]?.trim();
}

function buildMSearch(st: string): string {
  return [
    "M-SEARCH * HTTP/1.1",
    `HOST: ${SSDP_MULTICAST_ADDRESS}:${SSDP_PORT}`,
    'MAN: "ssdp:discover"',
    `MX: ${SEARCH_MX_SECONDS}`,
    `ST: ${st}`,
    "",
    "",
  ].join("\r\n");
}

export const SSDP_DISCOVERY_ID = "ssdp";

export class SsdpDiscoveryProvider implements DiscoveryProvider {
  id = SSDP_DISCOVERY_ID;
  displayName = "Your home network (direct, no Family Command Center needed)";

  async scan(onFound: (device: DiscoveredDevice) => void, signal?: AbortSignal): Promise<void> {
    // Never throws outward — a household with no multicast entitlement granted yet, or a
    // network that blocks multicast entirely, is exactly the same "nothing found" case FCC
    // being unconfigured already is, not an error state for this to surface.
    const socket = dgram.createSocket({ type: "udp4" });
    const seen = new Set<string>(); // `${ip}|${st}` — a responder can reply more than once to the same request

    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("error", reject);
        socket.bind(0, () => resolve());
      });
    } catch (err) {
      socket.close();
      return; // couldn't even open a local UDP socket — treat as "nothing found", not a thrown error
    }

    socket.on("message", (msg: Buffer, rinfo: { address: string }) => {
      const response = msg.toString("utf8");
      if (!/^HTTP\/1\.1 200/i.test(response)) return;
      const st = extractSsdpHeader(response, "ST");
      const server = extractSsdpHeader(response, "SERVER") ?? "";
      const target = SEARCH_TARGETS.find((t) => t.st === st);
      if (!target) return;
      if (target.requireServerMatch && !target.requireServerMatch.test(server)) return;

      const key = `${rinfo.address}|${target.st}`;
      if (seen.has(key)) return;
      seen.add(key);

      onFound({
        id: `ssdp-${rinfo.address}-${target.driverId}`,
        name: `${target.manufacturer} (${rinfo.address})`,
        category: target.category,
        manufacturer: target.manufacturer,
        driverId: target.driverId,
        metadata: { ipAddress: rinfo.address },
      });
    });

    for (const target of SEARCH_TARGETS) {
      const packet = buildMSearch(target.st);
      // Sending to a multicast address needs no prior group-membership call — only receiving
      // multicast traffic would (irrelevant here, since responses come back unicast).
      socket.send(packet, undefined, undefined, SSDP_PORT, SSDP_MULTICAST_ADDRESS, () => {});
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, SCAN_WINDOW_MS);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    socket.close();
  }
}
