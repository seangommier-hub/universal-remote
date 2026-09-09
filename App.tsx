import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { connectAllDevices, createHearthRuntime } from "./src/runtime/bootstrap";
import { loadDevices, saveDevice } from "./src/runtime/persistence";
import { Device } from "./src/core/types/Device";
import { logger } from "./src/core/logging/logger";
import { DeviceListScreen, AddableBrand } from "./src/ui/DeviceListScreen";
import { UniversalTvRemote } from "./src/ui/UniversalTvRemote";
import { AddSonyDeviceScreen } from "./src/ui/AddSonyDeviceScreen";
import { AddSamsungDeviceScreen } from "./src/ui/AddSamsungDeviceScreen";
import { AddLgDeviceScreen } from "./src/ui/AddLgDeviceScreen";
import { AddRokuDeviceScreen } from "./src/ui/AddRokuDeviceScreen";
import { DiscoverDevicesScreen } from "./src/ui/DiscoverDevicesScreen";
import { FamilyCommandCenterSettingsScreen } from "./src/ui/FamilyCommandCenterSettingsScreen";
import { CapabilityButton } from "./src/ui/CapabilityButton";
import { theme } from "./src/ui/theme";

type Screen =
  | { name: "list" }
  | { name: "remote"; device: Device }
  | { name: "add"; brand: AddableBrand }
  | { name: "discover" }
  | { name: "fcc-settings" };

export default function App() {
  const runtime = useMemo(() => createHearthRuntime(), []);
  const [ready, setReady] = useState(false);
  const [devices, setDevices] = useState<Device[]>(runtime.devices);
  const [screen, setScreen] = useState<Screen>({ name: "list" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await connectAllDevices(runtime);
      const persisted = await loadDevices();
      persisted.forEach((device) => runtime.deviceRegistry.add(device));
      if (cancelled) return;
      setDevices(runtime.deviceRegistry.list());
      setReady(true);

      // Reconnecting a real device (Samsung/LG especially) can mean waiting up to 30s for an
      // on-screen pairing prompt the user may not be next to right now — never block app
      // startup on that. Each device connects independently in the background; the device list
      // already shows the device either way, just with "disconnected" state until this resolves.
      persisted.forEach(async (device) => {
        const driver = runtime.driverRegistry.get(device.driverId);
        try {
          await driver?.connect(device);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.warn("App", `Could not reconnect persisted device ${device.name} on startup`, { message });
        }
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [runtime]);

  function handleDeviceAdded(device: Device) {
    runtime.deviceRegistry.add(device);
    setDevices(runtime.deviceRegistry.list());
    setScreen({ name: "remote", device });
    saveDevice(device).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("App", `Could not persist device ${device.name}`, { message });
    });
  }

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.accentEnd} size="large" />
        <StatusBar style="light" />
      </View>
    );
  }

  const addScreenProps = {
    driverRegistry: runtime.driverRegistry,
    onCancel: () => setScreen({ name: "list" }),
    onAdded: handleDeviceAdded,
  };

  return (
    <View style={styles.container}>
      {screen.name === "remote" && (
        <>
          <View style={styles.backRow}>
            <CapabilityButton icon="chevron-back" label="Devices" variant="ghost" onPress={() => setScreen({ name: "list" })} />
          </View>
          <UniversalTvRemote device={screen.device} commandEngine={runtime.commandEngine} stateStore={runtime.stateStore} />
        </>
      )}
      {screen.name === "add" && screen.brand === "sony" && <AddSonyDeviceScreen {...addScreenProps} />}
      {screen.name === "add" && screen.brand === "samsung" && <AddSamsungDeviceScreen {...addScreenProps} />}
      {screen.name === "add" && screen.brand === "lg" && <AddLgDeviceScreen {...addScreenProps} />}
      {screen.name === "add" && screen.brand === "roku" && <AddRokuDeviceScreen {...addScreenProps} />}
      {screen.name === "discover" && (
        <DiscoverDevicesScreen
          driverRegistry={runtime.driverRegistry}
          onCancel={() => setScreen({ name: "list" })}
          onAdded={handleDeviceAdded}
          onOpenSettings={() => setScreen({ name: "fcc-settings" })}
        />
      )}
      {screen.name === "fcc-settings" && (
        <FamilyCommandCenterSettingsScreen onCancel={() => setScreen({ name: "list" })} onSaved={() => setScreen({ name: "discover" })} />
      )}
      {screen.name === "list" && (
        <DeviceListScreen
          devices={devices}
          onSelect={(device) => setScreen({ name: "remote", device })}
          onAddDevice={(brand) => setScreen({ name: "add", brand })}
          onDiscover={() => setScreen({ name: "discover" })}
        />
      )}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  loading: { flex: 1, backgroundColor: theme.background, alignItems: "center", justifyContent: "center", gap: theme.spacing.md },
  backRow: { paddingTop: 56, paddingHorizontal: theme.spacing.xl, alignItems: "flex-start" },
});
