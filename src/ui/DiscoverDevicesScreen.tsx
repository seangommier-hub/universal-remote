import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DiscoveredDevice } from "../core/discovery/DiscoveryProvider";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { FamilyCommandCenterDiscoveryProvider } from "../discovery/FamilyCommandCenterDiscoveryProvider";
import { AddableBrand } from "./DeviceListScreen";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface DiscoverDevicesScreenProps {
  driverRegistry: DriverRegistry;
  stateStore: StateStore;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  onOpenSettings: () => void;
  /** Opens the manual Add screen for `brand`, pre-filling its IP field (ADR-HEARTH-062) — the
   * fallback for a device this screen found but couldn't auto-recognize the brand of (or guessed
   * wrong), or one on a network segment Family Command Center's own discovery can't fully see
   * (e.g. behind a router-mode WiFi repeater on its own subnet) but whose IP the user knows some
   * other way. Never blocked on auto-recognition succeeding. */
  onAddManually: (brand: AddableBrand, ipAddress: string) => void;
}

// The 5 brands with a real "manufacturer + IP, no other credential" manual-add shape — Hue needs a
// bridge IP (a different device than what's being added here) and SmartThings has no IP-based add
// at all (cloud-linked), so neither belongs in this fallback list.
const MANUAL_ADD_BRANDS: { brand: AddableBrand; label: string }[] = [
  { brand: "sony", label: "Sony TV" },
  { brand: "samsung", label: "Samsung TV" },
  { brand: "lg", label: "LG TV" },
  { brand: "roku", label: "Roku" },
  { brand: "yamaha", label: "Yamaha Receiver" },
  { brand: "xbox", label: "Xbox" },
];

type ConnectState = "idle" | "connecting" | "error";

/**
 * Lists devices found via the Family Command Center's own network inventory
 * (ADR-HEARTH-010) and lets the user connect a recognized brand with one
 * tap instead of typing its IP into the matching Add*Screen by hand — the
 * exact manual-entry pain ADR-HEARTH-008 identified. Devices this app has
 * no driver for are still shown, honestly labeled "not yet supported",
 * rather than silently hidden — and every device, recognized or not, offers
 * "Add manually as..." (ADR-HEARTH-062) so a brand-detection miss (or a
 * device this screen can see but can't classify) is never a dead end.
 */
export function DiscoverDevicesScreen({ driverRegistry, stateStore, onCancel, onAdded, onOpenSettings, onAddManually }: DiscoverDevicesScreenProps) {
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
  // Real bug found live (2026-09-12): Android's native Alert.alert silently drops any button past
  // the 3rd — with Cancel + 5 brands, LG/Roku/Yamaha were simply unreachable on Android (iOS
  // renders more, so this passed unnoticed there). A custom modal has no such platform-imposed cap.
  const [manualAddTarget, setManualAddTarget] = useState<DiscoveredDevice | null>(null);

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
      // Suggested name (ADR-HEARTH-085): `discovered.name` is only ever the network's generic
      // DHCP hostname — a driver that fetched the device's own real, human-set name at connect
      // time (Roku's `deviceName`, so far — see RokuEcpDriver.ts) reports it as live state, which
      // is a better initial name whenever it's actually available. Never overrides anything the
      // user later renames; this only shapes what gets saved the first time.
      const suggestedName = stateStore.get(device.id).values.deviceName;
      const named: Device = typeof suggestedName === "string" && suggestedName.trim() ? { ...device, name: suggestedName.trim() } : device;
      onAdded(named);
    } catch (err) {
      setConnectError({ id: discovered.id, message: err instanceof Error ? err.message : String(err) });
      // See ADR-HEARTH-052 / AddLgDeviceScreen.tsx: several of the drivers reachable from this
      // screen (LG, Samsung, Sony, Roku) schedule their own indefinite background reconnect loop
      // on any connect() failure, keyed to this discovered device's id. Since a failed attempt
      // here is never added/saved, nothing else ever owns or stops that loop — disconnect
      // immediately to cancel it. Harmless no-op for drivers (Hue, SmartThings) that don't have
      // one.
      driver.disconnect(device).catch(() => {});
    } finally {
      setConnectingId(null);
    }
  }

  function handlePickBrand(brand: AddableBrand) {
    if (!manualAddTarget) return;
    const ipAddress = String(manualAddTarget.metadata?.ipAddress ?? "");
    setManualAddTarget(null);
    onAddManually(brand, ipAddress);
  }

  if (status === "error") {
    const notConfigured = errorMessage.includes("isn't connected yet");
    return (
      <ScrollView style={[styles.container, { paddingTop: insets.top + theme.spacing.lg }]} contentContainerStyle={styles.centered}>
        <Ionicons name="wifi-outline" size={40} color={theme.textTertiary} />
        <Text style={styles.errorTitle}>Couldn't scan your network</Text>
        <Text style={styles.errorBody}>{errorMessage}</Text>
        {/* Real gap found in review (2026-09-19, ADR-HEARTH-089): this used to leave Family
            Command Center as the only way forward from here, even though most brands (everything
            except SmartThings, which genuinely needs it) work fine added manually with just an IP
            address — Discover is one option among several, not a precondition. */}
        {notConfigured && (
          <Text style={styles.errorBody}>
            Family Command Center is only needed for automatic discovery and SmartThings — every other brand can be added
            manually from the home screen right now, no setup required.
          </Text>
        )}
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
                <View style={styles.cardTopRow}>
                  <View style={styles.cardIcon}>
                    <Ionicons name={supported ? "tv-outline" : "help-circle-outline"} size={22} color={supported ? theme.accentEnd : theme.textTertiary} />
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.deviceName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.deviceMeta} numberOfLines={1}>
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
                {/* ADR-HEARTH-062: available for every device, not just unsupported ones — a wrong
                    auto-detected brand is exactly as much of a dead end as no detection at all. */}
                <Pressable
                  onPress={() => setManualAddTarget(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${item.name} manually as a different brand`}
                  hitSlop={4}
                >
                  <Text style={styles.addManuallyLabel}>Add manually as...</Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}

      <Modal visible={manualAddTarget !== null} transparent animationType="fade" onRequestClose={() => setManualAddTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setManualAddTarget(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Add {manualAddTarget?.name} manually</Text>
            <Text style={styles.modalBody}>Pick the actual brand — the IP address shown for this device carries over.</Text>
            {MANUAL_ADD_BRANDS.map(({ brand, label }) => (
              <Pressable key={brand} style={({ pressed }) => [styles.modalOption, pressed && styles.modalOptionPressed]} onPress={() => handlePickBrand(brand)}>
                <Text style={styles.modalOptionLabel}>{label}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.modalCancel} onPress={() => setManualAddTarget(null)}>
              <Text style={styles.modalCancelLabel}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
    gap: theme.spacing.sm,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  // Real bug found by code review (2026-09-12, same class as ADR-HEARTH-053/057): flex:1 with no
  // minWidth:0 gets an implicit min-content floor under the New Architecture's Yoga — a long
  // discovered device name (hostnames can be arbitrarily long) could force this box wider than the
  // space left by cardIcon + the Connect button, overlapping it instead of truncating.
  cardBody: { flex: 1, minWidth: 0 },
  deviceName: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "600" },
  deviceMeta: { color: theme.textSecondary, fontSize: theme.type.label, marginTop: theme.spacing.xs },
  unsupportedLabel: { color: theme.textTertiary, fontSize: theme.type.label, marginTop: theme.spacing.xs, fontStyle: "italic" },
  connectError: { color: theme.statusError, fontSize: theme.type.label, marginTop: theme.spacing.xs },
  addManuallyLabel: { color: theme.accentEnd, fontSize: theme.type.label, fontWeight: "600" },
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
  modalBackdrop: { flex: 1, backgroundColor: "#00000099", alignItems: "center", justifyContent: "center", padding: theme.spacing.xl },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: theme.surfaceRaised,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  modalTitle: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700" },
  modalBody: { color: theme.textSecondary, fontSize: theme.type.label, marginBottom: theme.spacing.sm },
  modalOption: { paddingVertical: theme.spacing.md, borderRadius: theme.radius.sm },
  modalOptionPressed: { backgroundColor: theme.surface },
  modalOptionLabel: { color: theme.accentEnd, fontSize: theme.type.body, fontWeight: "600" },
  modalCancel: { paddingVertical: theme.spacing.md, marginTop: theme.spacing.xs, borderTopWidth: 1, borderTopColor: theme.border },
  modalCancelLabel: { color: theme.textSecondary, fontSize: theme.type.body, fontWeight: "600", textAlign: "center" },
});
