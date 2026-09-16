// Thin client for Sony BRAVIA's IRCC-IP protocol -- a SOAP-over-HTTP endpoint that sends discrete
// named remote-button codes, distinct from the JSON-RPC REST API SonyBraviaClient.ts already uses
// for power/volume/input (that REST surface has no directional-nav/select/back/home equivalent at
// all -- see Phase 1's original "IRCC-IP explicitly deferred" note in ROADMAP.md).
//
// Real-hardware research (2026-09-16, ADR-HEARTH-071): the SOAP envelope shape and the code table
// below are corroborated from TWO independent real sources, not guessed:
//   1. A real device dump (Sony KD55XH9296BU) of `getRemoteControllerInfo`:
//      https://gist.github.com/henrik/32bb3b037b728b81a560d3676c7cfcf7
//   2. `AlecJDavidson/sony_bravia_api` (a maintained community Python client), whose
//      `iirc_codes.py` (labeled "Sony RMF-TX500 Remote Control IIRC Codes") and
//      `sony_bravia_api.py` (the exact `X_SendIRCC` SOAP envelope and headers) were both fetched
//      and read directly:
//      https://github.com/AlecJDavidson/sony_bravia_api/blob/main/src/sony_bravia_api/iirc_codes.py
//      https://github.com/AlecJDavidson/sony_bravia_api/blob/main/src/sony_bravia_api/sony_bravia_api.py
//   Both sources agree byte-for-byte on every code this driver uses (Confirm, Up, Down, Left,
//   Right, Home, Return, Play, Pause) -- treated as confirmed, not a single-source guess.
//
// Sony's own official docs (pro-bravia.sony.net/develop/integrate/ircc-ip/) confirm the mechanism
// (codes are discovered per-device via getRemoteControllerInfo, sent via this SOAP endpoint) but
// the page's code table itself is rendered client-side and wasn't extractable directly -- the two
// sources above are the actual code values used here.

import { requestWithRelayFallback } from "../../../core/network/httpRelayFallback";

const SONY_PORT = 80;
const IRCC_PATH = "/sony/ircc";

// Every code this driver actually uses -- not the full RMF-TX500 table, only what
// directionalNavigation/select/back/home map to. Adding a new mapped command later should pull
// from the same two corroborating sources, not a single one.
export const SONY_IRCC_CODES = {
  up: "AAAAAQAAAAEAAAB0Aw==",
  down: "AAAAAQAAAAEAAAB1Aw==",
  left: "AAAAAQAAAAEAAAA0Aw==",
  right: "AAAAAQAAAAEAAAAzAw==",
  confirm: "AAAAAQAAAAEAAABlAw==",
  home: "AAAAAQAAAAEAAABgAw==",
  return: "AAAAAgAAAJcAAAAjAw==",
} as const;

export interface SonyIrccConfig {
  ipAddress: string;
  psk: string;
}

function buildIrccEnvelope(code: string): string {
  return (
    '<?xml version="1.0"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
    "<s:Body>" +
    '<u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1">' +
    `<IRCCCode>${code}</IRCCCode>` +
    "</u:X_SendIRCC>" +
    "</s:Body>" +
    "</s:Envelope>"
  );
}

/** Talks to one Sony BRAVIA TV's IRCC-IP endpoint. One instance per TV, same PSK as the REST API. */
export class SonyIrccClient {
  constructor(private config: SonyIrccConfig) {}

  async sendCode(code: string): Promise<void> {
    const response = await requestWithRelayFallback({
      ip: this.config.ipAddress,
      port: SONY_PORT,
      path: IRCC_PATH,
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=UTF-8",
        "X-Auth-PSK": this.config.psk,
        SOAPAction: '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"',
      },
      body: buildIrccEnvelope(code),
    });
    if (!response.ok) {
      throw new Error(`Sony BRAVIA at ${this.config.ipAddress} returned HTTP ${response.status} for IRCC code`);
    }
  }
}
