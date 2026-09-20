// Real experiment (2026-09-20): react-native-udp (the only UDP option this project had) is
// confirmed broken under Expo SDK 57's mandatory New Architecture -- every UDP-broadcast feature
// (Xbox, PS5's original approach, SSDP, Wake-on-LAN) had to move server-side onto Family Command
// Center as a result. Sean pushed back on treating that as a permanent architectural fact: "many
// of these huge companies have apps of their own so clearly the tech is there" -- correct, the
// underlying iOS/Android platform capability obviously exists; the gap was specifically "no
// working New-Architecture-compatible library," not "impossible on a phone."
//
// `react-native-jsi-udp` (github.com/mybigday/react-native-jsi-udp) is a real candidate: built on
// JSI (the actual foundation of the New Architecture, unlike react-native-udp's old bridge-based
// design), a genuine Node-dgram-shaped API confirmed directly from its own source
// (createSocket/bind/send/setBroadcast/addMembership, not just a README claim), with real
// SO_BROADCAST support at the native layer. Honestly immature (14 GitHub stars, 2 forks, thin
// docs) -- this file is a deliberately isolated, real-hardware experiment, not yet wired into any
// production driver, so a failure here costs nothing beyond this one file.
//
// Assumes a /24 (255.255.255.0) home-network subnet -- expo-network doesn't expose a netmask, and
// a /24 is the standard default for the overwhelming majority of consumer routers (confirmed
// against this exact household's own network earlier today: 192.168.1.0/24, 10.20.30.0/24). A
// real subnet other than /24 would send the broadcast to the wrong address; a future iteration
// could ask Family Command Center what netmask it sees on the LAN, but that's not needed to prove
// the fundamental question this file exists to answer: does raw UDP broadcast actually work at
// all, directly from the phone, under this app's real Expo SDK 57 New Architecture build.

import dgram from "react-native-jsi-udp";
import * as Network from "expo-network";

const WOL_PORT = 9;
const MAC_BYTE_COUNT = 6;
const MAC_REPETITIONS = 16;

function parseMacAddress(macAddress: string): Buffer {
  const cleaned = macAddress.replace(/[:-]/g, "");
  if (cleaned.length !== MAC_BYTE_COUNT * 2 || !/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new Error(`Invalid MAC address: ${macAddress}`);
  }
  return Buffer.from(cleaned, "hex");
}

function buildMagicPacket(macAddress: string): Buffer {
  const mac = parseMacAddress(macAddress);
  return Buffer.concat([Buffer.alloc(MAC_BYTE_COUNT, 0xff), Buffer.concat(Array(MAC_REPETITIONS).fill(mac))]);
}

/** /24-assumption broadcast address for the phone's own current WiFi subnet -- see this file's own top comment for why /24 is a reasonable default rather than a real netmask lookup. */
function assumedBroadcastAddress(ipAddress: string): string {
  const parts = ipAddress.split(".");
  if (parts.length !== 4) throw new Error(`Unexpected IP address shape from expo-network: ${ipAddress}`);
  return `${parts[0]}.${parts[1]}.${parts[2]}.255`;
}

/**
 * Sends a real Wake-on-LAN magic packet directly from the phone's own WiFi radio -- no Family
 * Command Center involved at all. Only reaches a device on the SAME subnet the phone is currently
 * joined to (the household's main WiFi, most commonly) -- a device on a network the phone itself
 * isn't on (an isolated Guest/IoT segment, or the Pi's own separately-hosted AP) still needs the
 * FCC relay this project already has, for the same physical reason FCC itself can't reach a
 * network it has no interface on. This is a genuine experiment to confirm raw UDP broadcast is
 * possible from Hearth directly at all -- not yet a replacement for the FCC-relayed path, an
 * additional, FCC-independent option for the common case (device on the phone's own WiFi).
 */
export async function sendWakeOnLanDirect(macAddress: string): Promise<void> {
  const ipAddress = await Network.getIpAddressAsync();
  if (!ipAddress || ipAddress === "0.0.0.0") {
    throw new Error("Could not determine this phone's own WiFi address");
  }
  const broadcastAddress = assumedBroadcastAddress(ipAddress);
  const packet = buildMagicPacket(macAddress);

  const socket = dgram.createSocket("udp4");
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.bind(0, undefined, () => {
        socket.setBroadcast(true);
        socket.send(packet, 0, packet.length, WOL_PORT, broadcastAddress, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  } finally {
    socket.close();
  }
}
