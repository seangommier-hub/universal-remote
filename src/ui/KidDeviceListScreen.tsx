import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommandEngine } from "../core/engine/CommandEngine";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { DeviceListSections } from "./DeviceListSections";
import { KidModePinModal } from "./KidModePinModal";
import { NowPlayingWidget } from "./NowPlayingWidget";
import { theme } from "./theme";
import { KidModeControls } from "./useKidMode";
import { useDeviceLayout } from "./useDeviceLayout";
import { useNowPlaying } from "./useNowPlaying";

const EMPTY_TEXT = "No devices are set up for kids yet. Ask a grown-up.";

interface KidDeviceListScreenProps {
  devices: Device[];
  stateStore: StateStore;
  commandEngine: CommandEngine;
  kid: KidModeControls;
  onSelect: (device: Device) => void;
}

/** The Devices tab in kid mode (ADR-HEARTH-176): only the allowed devices, no editing or setup controls, and a lock button that asks for the PIN. */
export function KidDeviceListScreen({ devices, stateStore, commandEngine, kid, onSelect }: KidDeviceListScreenProps) {
  const insets = useSafeAreaInsets();
  const layout = useDeviceLayout(devices, true);
  const nowPlaying = useNowPlaying(layout.visibleDevices, stateStore);
  const [askingPin, setAskingPin] = useState(false);
  return (
    <View style={[styles.container, { paddingTop: insets.top + theme.spacing.lg }]}>
      <View style={styles.header}>
        <View style={styles.brandMark}>
          <View style={styles.emberDot} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            Hearth
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Kid mode
          </Text>
        </View>
        <Pressable style={({ pressed }) => [styles.lockButton, pressed && styles.pressed]} onPress={() => setAskingPin(true)} accessibilityRole="button" accessibilityLabel="Leave kid mode">
          <Ionicons name="lock-closed-outline" size={20} color={theme.accentEnd} />
        </Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {nowPlaying && <NowPlayingWidget device={nowPlaying.device} title={nowPlaying.title} stateStore={stateStore} commandEngine={commandEngine} onOpen={() => onSelect(nowPlaying.device)} />}
        {layout.visibleDevices.length === 0 ? (
          <Text style={styles.empty}>{EMPTY_TEXT}</Text>
        ) : (
          <DeviceListSections model={layout.model} stateStore={stateStore} onSelect={onSelect} onLongPress={ignoreLongPress} onToggleRoom={layout.toggleRoom} />
        )}
      </ScrollView>
      <KidModePinModal
        visible={askingPin}
        mode="verify"
        vault={kid.vault}
        onCancel={() => setAskingPin(false)}
        onSuccess={() => {
          setAskingPin(false);
          kid.disable();
        }}
      />
    </View>
  );
}

function ignoreLongPress(): void {}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background, paddingHorizontal: theme.spacing.xl },
  scrollContent: { paddingBottom: theme.spacing.xxl },
  header: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginBottom: theme.spacing.xl },
  headerText: { flex: 1, minWidth: 0 },
  brandMark: { width: 44, height: 44, borderRadius: theme.radius.md, backgroundColor: theme.accentSoft, alignItems: "center", justifyContent: "center" },
  emberDot: { width: 16, height: 16, borderRadius: theme.radius.full, backgroundColor: theme.accentEnd },
  title: { color: theme.textPrimary, fontSize: theme.type.display, fontWeight: "700" },
  subtitle: { color: theme.textSecondary, fontSize: theme.type.body },
  lockButton: { width: 44, height: 44, borderRadius: theme.radius.md, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.6 },
  empty: { color: theme.textSecondary, fontSize: theme.type.body, textAlign: "center", paddingVertical: theme.spacing.xxl },
});
