import { KIND_LABEL } from "./deviceKind";
import { DiscoveryRow } from "./discoveryRows";

// ADR-HEARTH-167: an unrecognized device is not a dead row. It says what it looks like and offers
// a prefilled report (vendor, model, address evidence) the person can send so support can be added.

export const SUPPORT_REQUEST_SUBJECT = "Hearth device support request";

const VOWELS = "aeiou";
const MAC_PREFIX_OCTETS = 3;

function withArticle(label: string): string {
  const lower = label.toLowerCase();
  return `${VOWELS.includes(lower[0]) ? "an" : "a"} ${lower}`;
}

/** True for a row that is neither recognized nor already added, i.e. the ones a support request makes sense for. */
export function canRequestSupport(row: DiscoveryRow): boolean {
  return row.brand === null && row.action === "identify";
}

/** "Looks like a camera. Not supported yet" — or a plainer line when even the kind is unknown. */
export function looksLikeLine(row: DiscoveryRow): string {
  if (row.kind === "unknown") return "Not recognized yet";
  return `Looks like ${withArticle(KIND_LABEL[row.kind])}. Not supported yet`;
}

function field(label: string, value: string | null | undefined): string | null {
  return value ? `${label}: ${value}` : null;
}

/** The report text: what the device is and everything discovery saw; only the MAC vendor prefix, never the full address. */
export function buildSupportRequest(row: DiscoveryRow): string {
  const { device } = row;
  const lines = [
    "Please add support for this device in Hearth.",
    "",
    field("Looks like", KIND_LABEL[row.kind]),
    field("Name", device.friendlyName),
    field("Vendor", device.vendor),
    field("Model", device.model),
    field("Hostname", device.hostname),
    field("MAC prefix", device.mac ? device.mac.split(":").slice(0, MAC_PREFIX_OCTETS).join(":") : null),
    device.evidence.length > 0 ? `Seen: ${device.evidence.join("; ")}` : null,
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}
