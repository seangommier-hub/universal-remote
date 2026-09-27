import { HaBrowseMediaRaw, normalizeBrowseNode } from "./haMediaBrowse";

describe("normalizeBrowseNode (ADR-HEARTH-182)", () => {
  test("maps a full reply's own fields and its children", () => {
    const raw: HaBrowseMediaRaw = {
      title: "Playlists",
      media_content_id: "playlists",
      media_content_type: "directory",
      can_play: false,
      can_expand: true,
      thumbnail: "https://ha.test/thumb.jpg",
      children: [
        { title: "Jazz", media_content_id: "track-1", media_content_type: "music", can_play: true, can_expand: false },
        { title: "More", media_content_id: "folder-2", media_content_type: "directory", can_play: false, can_expand: true },
      ],
    };
    expect(normalizeBrowseNode(raw)).toEqual({
      title: "Playlists", mediaContentId: "playlists", mediaContentType: "directory", canPlay: false, canExpand: true, thumbnail: "https://ha.test/thumb.jpg",
      children: [
        { title: "Jazz", mediaContentId: "track-1", mediaContentType: "music", canPlay: true, canExpand: false },
        { title: "More", mediaContentId: "folder-2", mediaContentType: "directory", canPlay: false, canExpand: true },
      ],
    });
  });

  test("a leaf with no children array becomes an empty list, and missing fields degrade instead of throwing", () => {
    expect(normalizeBrowseNode({ can_play: true })).toEqual({ title: "Untitled", mediaContentId: "", mediaContentType: "", canPlay: true, canExpand: false, children: [] });
    expect(normalizeBrowseNode({})).toMatchObject({ title: "Untitled", children: [] });
  });
});
