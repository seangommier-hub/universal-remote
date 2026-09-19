import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CommandEngine } from "../core/engine/CommandEngine";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface NowPlayingWidgetProps {
  device: Device;
  title: string;
  stateStore: StateStore;
  commandEngine: CommandEngine;
  onOpen: () => void;
}

/**
 * A compact "now playing" bar (Sean's ask: "much like the itunes/music player") pinned to the
 * home screen for whichever single device is actively playing or paused right now — deliberately
 * one at a time, not a widget per device, per Sean's own explicit scoping. No real per-title
 * artwork exists from any of this app's protocols (Roku ECP/LG SSAP/etc. expose an app name at
 * best, never poster art for what's actually on screen within that app) — the icon shown here is
 * always a generic playback glyph, not a fabricated thumbnail.
 */
export function NowPlayingWidget({ device, title, stateStore, commandEngine, onOpen }: NowPlayingWidgetProps) {
  const [playbackState, setPlaybackState] = useState(() => stateStore.get(device.id).values.playbackState);

  useEffect(() => {
    setPlaybackState(stateStore.get(device.id).values.playbackState);
    return stateStore.subscribe(device.id, (state) => setPlaybackState(state.values.playbackState));
  }, [stateStore, device.id]);

  function send(capability: "playPause" | "back" | "home") {
    commandEngine.execute({ deviceId: device.id, capability }).catch(() => {});
  }

  const isPlaying = playbackState === "playing";

  return (
    <Pressable style={styles.container} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Now playing on ${device.name}: ${title}`}>
      <View style={styles.thumbnail}>
        <Ionicons name="play-circle-outline" size={22} color={theme.accentEnd} />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {device.name}
        </Text>
      </View>
      <View style={styles.controls}>
        {device.capabilities.includes("back") && (
          <CapabilityButton
            label="Back"
            icon="play-back-outline"
            shape="circle"
            variant="ghost"
            onPress={() => send("back")}
            containerStyle={styles.controlButton}
          />
        )}
        {device.capabilities.includes("playPause") && (
          <CapabilityButton
            label={isPlaying ? "Pause" : "Play"}
            icon={isPlaying ? "pause" : "play"}
            shape="circle"
            variant="accent"
            onPress={() => send("playPause")}
            containerStyle={styles.controlButton}
          />
        )}
        {device.capabilities.includes("home") && (
          <CapabilityButton
            label="Home"
            icon="home-outline"
            shape="circle"
            variant="ghost"
            onPress={() => send("home")}
            containerStyle={styles.controlButton}
          />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.surfaceRaised,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: theme.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: { flex: 1, minWidth: 0 },
  title: { color: theme.textPrimary, fontSize: theme.type.label, fontWeight: "700" },
  subtitle: { color: theme.textSecondary, fontSize: theme.type.caption, marginTop: 2 },
  controls: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  controlButton: { width: 36, height: 36 },
});
