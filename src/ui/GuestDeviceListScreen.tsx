import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommandEngine } from "../core/engine/CommandEngine";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { DeviceListSections } from "./DeviceListSections";
import { NowPlayingWidget } from "./NowPlayingWidget";
import { theme } from "./theme";
import { useDeviceLayout } from "./useDeviceLayout";
import { useNowPlaying } from "./useNowPlaying";

const EMPTY_TEXT = "No devices are set up for guests yet. Ask the household owner.";

interface GuestDeviceListScreenProps {
  devices: Device[];
  stateStore: StateStore;
  commandEngine: CommandEngine;
  onSelect: (device: Device) => void;
}

/** The Devices tab for a guest-role phone (ADR-HEARTH-189, phase 2): same restriction concept as
 * kid mode (KidDeviceListScreen, ADR-HEARTH-176) -- only the allowed devices, no editing or setup
 * controls -- but no lock button and no PIN, since a guest is a known adult (e.g. a babysitter),
 * not a child, and this phone's guest access is entirely controlled by its own token's role on the
 * Pi (adr/0218), not a local toggle this phone could turn off itself. */
export function GuestDeviceListScreen({ devices, stateStore, commandEngine, onSelect }: GuestDeviceListScreenProps) {
  const insets = useSafeAreaInsets();
  const layout = useDeviceLayout(devices, false, true);
  const nowPlaying = useNowPlaying(layout.visibleDevices, stateStore);
  return (
    <View style={[styles.container, { paddingTop: insets.top + theme.spacing.lg }]}>
      <View style={styles.header}>
        <View style={styles.brandMark}>
          <Ionicons name="person-outline" size={18} color={theme.accentEnd} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            Hearth
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Guest
          </Text>
        </View>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {nowPlaying && <NowPlayingWidget device={nowPlaying.device} title={nowPlaying.title} stateStore={stateStore} commandEngine={commandEngine} onOpen={() => onSelect(nowPlaying.device)} />}
        {layout.visibleDevices.length === 0 ? (
          <Text style={styles.empty}>{EMPTY_TEXT}</Text>
        ) : (
          <DeviceListSections model={layout.model} stateStore={stateStore} onSelect={onSelect} onLongPress={ignoreLongPress} onToggleSection={layout.toggleSection} />
        )}
      </ScrollView>
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
  title: { color: theme.textPrimary, fontSize: theme.type.display, fontWeight: "700" },
  subtitle: { color: theme.textSecondary, fontSize: theme.type.body },
  empty: { color: theme.textSecondary, fontSize: theme.type.body, textAlign: "center", paddingVertical: theme.spacing.xxl },
});
