import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DiscoveredDevice } from "../core/discovery/DiscoveryProvider";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { FamilyCommandCenterDiscoveryProvider } from "../discovery/FamilyCommandCenterDiscoveryProvider";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface DiscoverDevicesScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  onOpenSettings: () => void;
}

type ConnectState = "idle" | "connecting" | "error";

/**
 * Lists devices found via the Family Command Center's own network inventory
 * (ADR-HEARTH-010) and lets the user connect a recognized brand with one
 * tap instead of typing its IP into the matching Add*Screen by hand — the
 * exact manual-entry pain ADR-HEARTH-008 identified. Devices this app has
 * no driver for are still shown, honestly labeled "not yet supported",
 * rather than silently hidden.
 */
export function DiscoverDevicesScreen({ driverRegistry, onCancel, onAdded, onOpenSettings }: DiscoverDevicesScreenProps) {
  // Real-hardware finding (2026-09-10): every screen in this app used a hardcoded paddingTop
  // (56 here) guessed to clear an iPhone's notch — never verified against Android, where the
  // status bar's actual height varies by device/emulator and can be taller than that guess,
  // pushing this screen's own header (title + Cancel) up underneath it. Now derived from the
  // real device inset via react-native-safe-area-context instead of a fixed number.
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<"scanning" | "done" | "error">("scanning");
  const [errorMessage, setErrorMessage] = useState("");
  const [found, setFound] = useState<DiscoveredDevice[]>([]);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<{ id: string; message: string } | null>(null);

  const runScan = useCallback(async () => {
    setStatus("scanning");
    setErrorMessage("");
    setFound([]);
    const provider = new FamilyCommandCenterDiscoveryProvider();
    const results: DiscoveredDevice[] = [];
    try {
      await provider.scan((device) => results.push(device));
      setFound(results);
      setStatus("done");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    runScan();
  }, [runScan]);

  async function handleConnect(discovered: DiscoveredDevice) {
    const driver = driverRegistry.get(discovered.driverId);
    if (!driver) return; // "not yet supported" tiles have no driverId and render no Connect button

    const ipAddress = discovered.metadata?.ipAddress;
    // hwaddr (real-hardware finding, 2026-09-10): saved alongside ipAddress so a driver can
    // re-locate this device by MAC through the Family Command Center if it ever moves to a
    // different WiFi network/VLAN and the saved IP goes stale — see LgWebOsDriver.connectClient.
    // Only devices added via discovery ever have one; manually-entered devices (Add Sony/Samsung/
    // LG/Roku TV) have no MAC to record and simply don't get this recovery path.
    const hwaddr = discovered.metadata?.hwaddr;
    const device: Device = {
      id: discovered.id,
      name: discovered.name,
      category: discovered.category,
      manufacturer: discovered.manufacturer,
      driverId: discovered.driverId,
      capabilities: driver.getCapabilities(),
      config: { ipAddress, hwaddr },
    };

    setConnectingId(discovered.id);
    setConnectError(null);
    try {
      await driver.connect(device);
      onAdded(device);
    } catch (err) {
      setConnectError({ id: discovered.id, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setConnectingId(null);
    }
  }

  if (status === "error") {
    const notConfigured = errorMessage.includes("isn't connected yet");
    return (
      <ScrollView style={[styles.container, { paddingTop: insets.top + theme.spacing.lg }]} contentContainerStyle={styles.centered}>
        <Ionicons name="wifi-outline" size={40} color={theme.textTertiary} />
        <Text style={styles.errorTitle}>Couldn't scan your network</Text>
        <Text style={styles.errorBody}>{errorMessage}</Text>
        <View style={styles.row}>
          <CapabilityButton label="Back" variant="ghost" onPress={onCancel} />
          {notConfigured ? (
            <CapabilityButton label="Connect Family Command Center" variant="accent" onPress={onOpenSettings} />
          ) : (
            <CapabilityButton label="Try Again" variant="accent" onPress={runScan} />
          )}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + theme.spacing.lg }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Discover Devices</Text>
        <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
      <Text style={styles.subtitle}>Found on your home network via Family Command Center</Text>

      {status === "scanning" ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.accentEnd} size="large" />
          <Text style={styles.scanningText}>Scanning...</Text>
        </View>
      ) : found.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="search-outline" size={36} color={theme.textTertiary} />
          <Text style={styles.errorBody}>No devices reported by your network right now.</Text>
        </View>
      ) : (
        <FlatList
          data={found}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const supported = item.driverId.length > 0;
            const isConnecting = connectingId === item.id;
            return (
              <View style={styles.card}>
                <View style={styles.cardIcon}>
                  <Ionicons name={supported ? "tv-outline" : "help-circle-outline"} size={22} color={supported ? theme.accentEnd : theme.textTertiary} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.deviceName}>{item.name}</Text>
                  <Text style={styles.deviceMeta}>
                    {item.manufacturer} · {String(item.metadata?.ipAddress ?? "")}
                  </Text>
                  {!supported && <Text style={styles.unsupportedLabel}>Not yet supported</Text>}
                  {connectError?.id === item.id && <Text style={styles.connectError}>Couldn't connect: {connectError.message}</Text>}
                </View>
                {supported && (
                  <Pressable
                    style={({ pressed }) => [styles.connectButton, pressed && styles.connectButtonPressed]}
                    onPress={() => handleConnect(item)}
                    disabled={isConnecting}
                    accessibilityRole="button"
                    accessibilityLabel={`Connect ${item.name}`}
                  >
                    {isConnecting ? <ActivityIndicator color={theme.background} size="small" /> : <Text style={styles.connectLabel}>Connect</Text>}
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background, paddingHorizontal: theme.spacing.xl },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: theme.spacing.xs },
  title: { color: theme.textPrimary, fontSize: theme.type.title, fontWeight: "700" },
  subtitle: { color: theme.textSecondary, fontSize: theme.type.label, marginBottom: theme.spacing.lg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md, paddingVertical: theme.spacing.xxl },
  scanningText: { color: theme.textSecondary, fontSize: theme.type.body },
  errorTitle: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "600" },
  errorBody: { color: theme.textSecondary, fontSize: theme.type.label, textAlign: "center", paddingHorizontal: theme.spacing.xl },
  row: { flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.md },
  list: { gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1 },
  deviceName: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "600" },
  deviceMeta: { color: theme.textSecondary, fontSize: theme.type.label, marginTop: theme.spacing.xs },
  unsupportedLabel: { color: theme.textTertiary, fontSize: theme.type.label, marginTop: theme.spacing.xs, fontStyle: "italic" },
  connectError: { color: theme.statusError, fontSize: theme.type.label, marginTop: theme.spacing.xs },
  connectButton: {
    backgroundColor: theme.accentEnd,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    minWidth: 84,
    alignItems: "center",
  },
  connectButtonPressed: { opacity: 0.7 },
  connectLabel: { color: theme.background, fontWeight: "600", fontSize: theme.type.label },
});
