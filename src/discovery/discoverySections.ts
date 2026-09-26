import { Device } from "../core/types/Device";
import { NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { candidateRank, groupOfKind, KIND_GROUPS, KindGroupId } from "./deviceKind";
import { DiscoveryRow, compareByName, toDiscoveryRow } from "./discoveryRows";
import { DeviceLabels } from "./discoveryLabels";
import { DiscoveryConfidence, NetworkDevice } from "./discoverAll";

// ADR-HEARTH-153: the Discover screen's structure as plain data. "Ready to add" and "Recognized,
// offline" lead; everything unrecognized is collapsed behind one row and grouped by kind; things a
// person hid live under "Hidden (n)". The screen only maps this to components.

export const SEARCH_THRESHOLD = 8;
export const SUGGESTED_LIMIT = 3;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const JUST_NOW_SECONDS = 2;
const MS_PER_SECOND = 1000;

const CONFIDENCE_RANK: Record<DiscoveryConfidence, number> = { certain: 3, likely: 2, guess: 1, unknown: 0 };

export interface OtherGroup {
  id: KindGroupId;
  title: string;
  rows: DiscoveryRow[];
}

export interface DiscoverySections {
  ready: DiscoveryRow[];
  offline: DiscoveryRow[];
  otherGroups: OtherGroup[];
  otherCount: number;
  hidden: DiscoveryRow[];
  addedCount: number;
  /** Devices Hearth could still add and that were not hidden: ready + offline + other. */
  addableCount: number;
  /** Rows listed anywhere (including hidden) before the search filter; decides whether to show the search box. */
  listedBeforeFilter: number;
}

/** True when the device's name, address, vendor or model contains what was typed. */
export function matchesQuery(row: DiscoveryRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const { device } = row;
  return [row.title, device.ip, device.vendor, device.hostname, device.model, device.friendlyName, row.brand?.label]
    .filter((text): text is string => Boolean(text))
    .some((text) => text.toLowerCase().includes(needle));
}

function byReadiness(a: DiscoveryRow, b: DiscoveryRow): number {
  const diff = CONFIDENCE_RANK[b.device.confidence] - CONFIDENCE_RANK[a.device.confidence];
  return diff !== 0 ? diff : compareByName(a, b);
}

function byCandidate(a: DiscoveryRow, b: DiscoveryRow): number {
  const diff = candidateRank(a.kind) - candidateRank(b.kind);
  if (diff !== 0) return diff;
  if (a.online !== b.online) return a.online ? -1 : 1;
  return compareByName(a, b);
}

function groupOther(rows: DiscoveryRow[]): OtherGroup[] {
  return KIND_GROUPS.map((group) => ({ ...group, rows: rows.filter((row) => groupOfKind(row.kind) === group.id).sort(byCandidate) })).filter((group) => group.rows.length > 0);
}

/** Splits the network into the screen's sections, applying the labels and the search text. */
export function buildSections(devices: NetworkDevice[], added: Device[], labels: DeviceLabels, query = ""): DiscoverySections {
  const all = devices.map((device) => toDiscoveryRow(device, added, labels));
  const open = all.filter((row) => row.action !== "added");
  const listedBeforeFilter = open.length;
  const shown = open.filter((row) => matchesQuery(row, query));
  const visible = shown.filter((row) => !row.hidden);
  const ready = visible.filter((row) => row.brand && row.online).sort(byReadiness);
  const offline = visible.filter((row) => row.brand && !row.online).sort(byReadiness);
  const other = visible.filter((row) => !row.brand);
  return {
    ready,
    offline,
    otherGroups: groupOther(other),
    otherCount: other.length,
    hidden: shown.filter((row) => row.hidden).sort(compareByName),
    addedCount: all.length - open.length,
    addableCount: visible.length,
    listedBeforeFilter,
  };
}

/** Whether the search box earns its space. */
export function shouldShowSearch(sections: DiscoverySections): boolean {
  return sections.listedBeforeFilter > SEARCH_THRESHOLD;
}

export type ListItem =
  | { type: "header"; key: string; title: string; count: number }
  | { type: "subheader"; key: string; title: string; count: number }
  | { type: "row"; key: string; row: DiscoveryRow }
  | { type: "toggle"; key: string; target: "other" | "hidden"; label: string; expanded: boolean }
  | { type: "no-match"; key: string };

export interface ExpansionState {
  otherExpanded: boolean;
  hiddenExpanded: boolean;
  /** A search is active: matching "other" and hidden rows are shown without needing to expand. */
  searching: boolean;
}

function rowItems(prefix: string, rows: DiscoveryRow[]): ListItem[] {
  return rows.map((row) => ({ type: "row", key: `${prefix}-${row.device.id}`, row }));
}

function otherItems(sections: DiscoverySections, expanded: boolean): ListItem[] {
  if (sections.otherCount === 0) return [];
  const noun = sections.otherCount === 1 ? "other device" : "other devices";
  const toggle: ListItem = {
    type: "toggle",
    key: "toggle-other",
    target: "other",
    expanded,
    label: expanded ? `Hide ${sections.otherCount} ${noun}` : `${sections.otherCount} ${noun} — show`,
  };
  if (!expanded) return [toggle];
  const groups = sections.otherGroups.flatMap((group): ListItem[] => [
    { type: "subheader", key: `sub-${group.id}`, title: group.title, count: group.rows.length },
    ...rowItems(group.id, group.rows),
  ]);
  return [{ type: "header", key: "hdr-other", title: "Other devices on your network", count: sections.otherCount }, ...groups, toggle];
}

function hiddenItems(sections: DiscoverySections, expanded: boolean): ListItem[] {
  if (sections.hidden.length === 0) return [];
  const toggle: ListItem = { type: "toggle", key: "toggle-hidden", target: "hidden", expanded, label: `Hidden (${sections.hidden.length})` };
  return expanded ? [toggle, ...rowItems("hidden", sections.hidden)] : [toggle];
}

/** Flattens the sections into the exact rows the list renders, in order. */
export function buildListItems(sections: DiscoverySections, expansion: ExpansionState): ListItem[] {
  const items: ListItem[] = [];
  if (sections.ready.length > 0) items.push({ type: "header", key: "hdr-ready", title: "Ready to add", count: sections.ready.length }, ...rowItems("ready", sections.ready));
  if (sections.offline.length > 0) items.push({ type: "header", key: "hdr-offline", title: "Recognized, offline", count: sections.offline.length }, ...rowItems("offline", sections.offline));
  items.push(...otherItems(sections, expansion.otherExpanded || expansion.searching));
  items.push(...hiddenItems(sections, expansion.hiddenExpanded || expansion.searching));
  if (items.length === 0 && expansion.searching) items.push({ type: "no-match", key: "no-match" });
  return items;
}

export type ScanStatus = "scanning" | "done";

export type DiscoverScreenState = "scanning" | "list" | "unreachable" | "not-configured" | "all-added" | "none-found";

export interface ScreenStateInput {
  status: ScanStatus;
  deviceCount: number;
  sections: DiscoverySections;
  failure: NetworkFailureDiagnosis | null;
  /** Whether Family Command Center is set up on this phone; null while still unknown. */
  fccConfigured: boolean | null;
}

/** Which whole-screen state applies: the list, or the one empty state that explains why there is no list. */
export function pickScreenState(input: ScreenStateInput): DiscoverScreenState {
  const { status, deviceCount, sections, failure, fccConfigured } = input;
  if (status === "scanning" && deviceCount === 0) return "scanning";
  if (sections.listedBeforeFilter > 0) return "list";
  if (deviceCount > 0) return "all-added";
  if (failure && failure.kind !== "not-configured") return "unreachable";
  if (fccConfigured === false) return "not-configured";
  return "none-found";
}

/** "Scanned 3 seconds ago" style text for the scan status line. */
export function formatScannedAgo(scannedAt: number | null, now: number): string {
  if (scannedAt === null) return "";
  const seconds = Math.max(0, Math.round((now - scannedAt) / MS_PER_SECOND));
  if (seconds < JUST_NOW_SECONDS) return "Scanned just now";
  if (seconds < SECONDS_PER_MINUTE) return `Scanned ${seconds} seconds ago`;
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) return `Scanned ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  return "Scanned over an hour ago";
}

export interface SuggestedPick {
  top: DiscoveryRow[];
  /** Addable devices not shown in `top`, for the "See all" link. */
  remaining: number;
}

/** The few ready-to-add devices the home screen shows, plus how many more the Discover screen has. */
export function pickSuggested(sections: DiscoverySections, limit = SUGGESTED_LIMIT): SuggestedPick {
  const top = sections.ready.slice(0, limit);
  return { top, remaining: sections.addableCount - top.length };
}
