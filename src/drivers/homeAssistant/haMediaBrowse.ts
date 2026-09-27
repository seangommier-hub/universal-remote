import { MediaBrowseItem, MediaBrowseNode } from "../../core/types/MediaBrowse";

/**
 * The shape Home Assistant's `media_player/browse_media` WebSocket command answers with (ADR-HEARTH-182).
 * The command itself, and `async_browse_media` returning a `BrowseMedia` object, are documented at
 * developers.home-assistant.io/docs/core/entity/media-player (fetched 2026-09-27); that page does not list
 * `BrowseMedia`'s own field names, so these (from the frontend's well-known consumption of it) are
 * Unverified against a live server — see the ADR.
 */
export interface HaBrowseMediaRaw {
  title?: unknown;
  media_content_id?: unknown;
  media_content_type?: unknown;
  can_play?: unknown;
  can_expand?: unknown;
  thumbnail?: unknown;
  children?: unknown;
}

const UNTITLED = "Untitled";

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function itemOf(raw: HaBrowseMediaRaw): MediaBrowseItem {
  const thumbnail = raw.thumbnail;
  return {
    title: stringOr(raw.title, UNTITLED),
    mediaContentId: stringOr(raw.media_content_id, ""),
    mediaContentType: stringOr(raw.media_content_type, ""),
    canExpand: raw.can_expand === true,
    canPlay: raw.can_play === true,
    ...(typeof thumbnail === "string" ? { thumbnail } : {}),
  };
}

/** Turns one `browse_media` reply into a node with its already-fetched children; a reply with no children array (a leaf) becomes an empty list. */
export function normalizeBrowseNode(raw: HaBrowseMediaRaw): MediaBrowseNode {
  const children = Array.isArray(raw.children) ? (raw.children as HaBrowseMediaRaw[]).map(itemOf) : [];
  return { ...itemOf(raw), children };
}
