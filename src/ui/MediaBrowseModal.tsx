import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CommandEngine } from "../core/engine/CommandEngine";
import { Device } from "../core/types/Device";
import { MediaBrowseItem, MediaBrowseNode } from "../core/types/MediaBrowse";
import { theme } from "./theme";

interface MediaBrowseModalProps {
  visible: boolean;
  device: Device;
  commandEngine: CommandEngine;
  onClose: () => void;
}

interface Crumb {
  title: string;
  mediaContentId?: string;
  mediaContentType?: string;
}

/**
 * A folders/tracks browser over Home Assistant's `media_player/browse_media` (ADR-HEARTH-182), opened from
 * the remote screen's own Browse button. Tapping an expandable item goes a level deeper; tapping a playable
 * one sends `play_media` and closes. Graceful when the entity has nothing to answer with (no children, or
 * the query itself failed) — the screen just says so, it never gets stuck.
 */
export function MediaBrowseModal({ visible, device, commandEngine, onClose }: MediaBrowseModalProps) {
  const rootCrumb: Crumb = { title: device.name };
  const [trail, setTrail] = useState<Crumb[]>([rootCrumb]);
  const [node, setNode] = useState<MediaBrowseNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canPlay = device.capabilities.includes("playMedia");

  async function load(crumb: Crumb) {
    setLoading(true);
    setError(null);
    const result = await commandEngine.browseMedia(device.id, crumb.mediaContentId, crumb.mediaContentType);
    setLoading(false);
    if (result.success && result.node) setNode(result.node);
    else {
      setNode(null);
      setError(result.error ?? "Browsing is not supported on this device.");
    }
  }

  useEffect(() => {
    if (!visible) return;
    setTrail([rootCrumb]);
    void load(rootCrumb);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, device.id]);

  function open(item: MediaBrowseItem) {
    const crumb: Crumb = { title: item.title, mediaContentId: item.mediaContentId, mediaContentType: item.mediaContentType };
    setTrail((current) => [...current, crumb]);
    void load(crumb);
  }

  function goBackTo(index: number) {
    setTrail((current) => current.slice(0, index + 1));
    void load(trail[index]);
  }

  async function play(item: MediaBrowseItem) {
    await commandEngine.execute({ deviceId: device.id, capability: "playMedia", args: { mediaContentId: item.mediaContentId, mediaContentType: item.mediaContentType } });
    onClose();
  }

  function pressItem(item: MediaBrowseItem) {
    if (item.canExpand) open(item);
    else if (item.canPlay && canPlay) void play(item);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close browse" hitSlop={8}>
            <Ionicons name="close" size={22} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {trail[trail.length - 1]?.title ?? "Browse"}
          </Text>
        </View>
        {trail.length > 1 && (
          <View style={styles.crumbRow}>
            {trail.map((crumb, index) => (
              <Pressable key={index} onPress={() => goBackTo(index)} disabled={index === trail.length - 1} accessibilityRole="button" accessibilityLabel={crumb.title}>
                <Text style={[styles.crumb, index === trail.length - 1 && styles.crumbActive]} numberOfLines={1}>
                  {crumb.title}
                  {index < trail.length - 1 ? " >" : ""}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        {loading && <ActivityIndicator style={styles.spinner} color={theme.accentEnd} />}
        {error && !loading && <Text style={styles.error}>{error}</Text>}
        {!loading && !error && node && (
          <FlatList
            data={node.children}
            keyExtractor={(item, index) => `${item.mediaContentId}-${index}`}
            ListEmptyComponent={<Text style={styles.empty}>Nothing here.</Text>}
            renderItem={({ item }) => (
              <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={() => pressItem(item)} accessibilityRole="button" accessibilityLabel={item.title}>
                <Ionicons name={item.canExpand ? "folder-outline" : "musical-note-outline"} size={20} color={theme.accentEnd} />
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.canPlay && canPlay && <Ionicons name="play" size={16} color={theme.textTertiary} />}
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background, padding: theme.spacing.lg, gap: theme.spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  title: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700", flexShrink: 1 },
  crumbRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
  crumb: { color: theme.textTertiary, fontSize: theme.type.caption },
  crumbActive: { color: theme.textPrimary, fontWeight: "600" },
  spinner: { marginTop: theme.spacing.lg },
  error: { color: theme.statusError, fontSize: theme.type.label },
  empty: { color: theme.textSecondary, fontSize: theme.type.label },
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.borderSubtle },
  rowPressed: { opacity: 0.6 },
  rowLabel: { color: theme.textPrimary, fontSize: theme.type.label, flex: 1 },
});
