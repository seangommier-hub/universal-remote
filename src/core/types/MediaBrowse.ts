/** One item in a media browse tree (ADR-HEARTH-182): a folder to open (`canExpand`) or a track/station to play (`canPlay`), or both. */
export interface MediaBrowseItem {
  title: string;
  mediaContentId: string;
  mediaContentType: string;
  canExpand: boolean;
  canPlay: boolean;
  thumbnail?: string;
}

/** One browsed node with the children Home Assistant returned for it in the same reply. */
export interface MediaBrowseNode extends MediaBrowseItem {
  children: MediaBrowseItem[];
}

/** The outcome of browsing through CommandEngine.browseMedia. Never throws — callers check `success`. */
export interface MediaBrowseResult {
  success: boolean;
  node?: MediaBrowseNode;
  error?: string;
}
