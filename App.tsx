import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, AppStateStatus, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { createHearthRuntime } from "./src/runtime/bootstrap";
import { loadDevices, removeDevice, saveDevice } from "./src/runtime/persistence";
import { bridgeDeviceState } from "./src/runtime/stateStoreBridge";
import { Device } from "./src/core/types/Device";
import { logger } from "./src/core/logging/logger";
import { DeviceListScreen, AddableBrand } from "./src/ui/DeviceListScreen";
import { UniversalTvRemote } from "./src/ui/UniversalTvRemote";
import { LightControlScreen } from "./src/ui/LightControlScreen";
import { AddSonyDeviceScreen } from "./src/ui/AddSonyDeviceScreen";
import { AddSamsungDeviceScreen } from "./src/ui/AddSamsungDeviceScreen";
import { AddLgDeviceScreen } from "./src/ui/AddLgDeviceScreen";
import { AddRokuDeviceScreen } from "./src/ui/AddRokuDeviceScreen";
import { AddHueDeviceScreen } from "./src/ui/AddHueDeviceScreen";
import { DiscoverDevicesScreen } from "./src/ui/DiscoverDevicesScreen";
import { FamilyCommandCenterSettingsScreen } from "./src/ui/FamilyCommandCenterSettingsScreen";
import { ScanFamilyCommandCenterQrScreen } from "./src/ui/ScanFamilyCommandCenterQrScreen";
import { CommandCenterRemoteScreen } from "./src/ui/CommandCenterRemoteScreen";
import { EditDeviceAddressScreen } from "./src/ui/EditDeviceAddressScreen";
import { theme } from "./src/ui/theme";

type Screen =
  | { name: "list" }
  | { name: "remote"; device: Device }
  | { name: "add"; brand: AddableBrand }
  | { name: "discover" }
  | { name: "fcc-scan" }
  | { name: "fcc-settings" }
  | { name: "fcc-remote" }
  | { name: "edit-address"; device: Device };

/** Attempts to (re)connect every known device, one at a time is unnecessary — each is independent, so all run concurrently. Never throws: a single device's failure (logged) doesn't stop the others or the caller. */
async function reconnectAllDevices(runtime: ReturnType<typeof createHearthRuntime>, devices: Device[]): Promise<void> {
  await Promise.all(
    devices.map(async (device) => {
      const driver = runtime.driverRegistry.get(device.driverId);
      try {
        await driver?.connect(device);
        // Real-hardware ask (2026-09-10): "only have to approve one time... forever remembered by
        // the tv." A driver (LG today) may have just mutated device.config with a freshly-learned
        // pairing key — re-saving here is what actually gets that onto disk, not just into memory
        // for this session. Cheap no-op for every driver whose config didn't change.
        saveDeviceQuietly(device);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn("App", `Could not reconnect ${device.name}`, { message });
      }
    })
  );
}

/** saveDevice(), but failures are logged and swallowed rather than thrown — every call site here is a background persistence step riding along an already-successful connect(), not something that should fail the caller's own flow. */
function saveDeviceQuietly(device: Device): void {
  saveDevice(device).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("App", `Could not persist ${device.name}`, { message });
  });
}

export default function App() {
  const runtime = useMemo(() => createHearthRuntime(), []);
  const [ready, setReady] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [screen, setScreen] = useState<Screen>({ name: "list" });
  const appState = useRef(AppState.currentState);
  // Real-hardware finding (2026-09-10): a device's driver was never wired to the shared
  // stateStore the UI actually reads — see stateStoreBridge.ts. One bridge per device, tracked by
  // id so handleRemoveDevice can unsubscribe it and a device can't accidentally be bridged twice.
  const stateBridges = useRef(new Map<string, () => void>()).current;

  // Sean, directly (2026-09-10): "i have ALLOWED IT like 15 times, i don't want to again." A
  // driver's own autonomous background retry (LgWebOsDriver.scheduleReconnect and its
  // Samsung/Hue equivalents) calls connect() on itself, never through handleReconnect/
  // reconnectAllDevices above — so a pairing key it learns only ever lived in memory. Passing
  // saveDeviceQuietly as bridgeDeviceState's onConnected hook means EVERY path that reaches
  // "connected" state persists device.config, not just the two App.tsx-initiated ones.
  function attachStateBridge(device: Device) {
    if (stateBridges.has(device.id)) return;
    const driver = runtime.driverRegistry.get(device.driverId);
    if (!driver) return;
    stateBridges.set(device.id, bridgeDeviceState(driver, device, runtime.stateStore, saveDeviceQuietly));
  }

  // Real bug, found in review (2026-09-10) while pointing Sean at EditDeviceAddressScreen:
  // attachStateBridge's own guard ("if already bridged, do nothing") means the very first Device
  // object reference ever bridged for an id is the one whose config the onConnected hook above
  // keeps re-saving, forever — even after handleRenameDevice/handleAddressUpdated below swap in a
  // corrected object everywhere else (the registry, the `devices` array). Without this, the very
  // next "connected" transition after a manual address fix would re-persist the OLD, stale
  // ipAddress right back over the just-saved correct one, silently undoing the fix with no error
  // shown anywhere. Tears down the stale subscription and re-attaches fresh against the corrected
  // object whenever identity-bearing fields (name, config) change out from under a device.
  function rebindStateBridge(updated: Device) {
    stateBridges.get(updated.id)?.();
    stateBridges.delete(updated.id);
    attachStateBridge(updated);
  }

  // Real-device finding (2026-09-10): "there are no buttons for streaming" — a device persisted
  // from an earlier pairing carries whatever `driver.getCapabilities()` returned AT THAT TIME
  // (AddLgDeviceScreen.tsx and its siblings set `capabilities` once, before this session's
  // launchApp/settings/sleepTimer additions existed). Nothing ever re-synced it, so a driver that
  // gained new capabilities after a device was paired left that device permanently unaware of
  // them. Capabilities are a pure function of the driver, not the live connection — refreshed
  // synchronously here, independent of whether connect() itself succeeds.
  function refreshCapabilities(device: Device) {
    const driver = runtime.driverRegistry.get(device.driverId);
    if (driver) device.capabilities = driver.getCapabilities();
  }

  // Sean, directly (2026-09-09): "make sure that nothing ever gets unconnected like a device on
  // wifi" — the one real gap ADR-HEARTH-017's per-driver backoff didn't cover: iOS can suspend
  // or kill a backgrounded app's WebSocket connections outright, and nothing was re-checking
  // connection state when the app came back to the foreground. A phone doesn't wait for a
  // 30-second WiFi retry timer after you unlock it — it reconnects the moment you're back. Same
  // idea here: any time the app returns to "active" from background/inactive, every known
  // device gets a reconnect attempt immediately, regardless of where its own backoff timer was.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      const cameFromBackground = appState.current.match(/inactive|background/) && nextState === "active";
      appState.current = nextState;
      if (cameFromBackground) {
        reconnectAllDevices(runtime, runtime.deviceRegistry.list());
      }
    });
    return () => subscription.remove();
  }, [runtime]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Real-hardware finding (2026-09-09): a SecureStore key-format bug in loadDevices() threw
      // here, unhandled — since nothing below setReady(true) ran, the app hung on its loading
      // spinner forever, with no error surfaced anywhere. That specific bug is fixed
      // (persistence.ts), but startup should never be able to hang indefinitely regardless of
      // what throws — this degrades to an empty device list (still usable, still recoverable)
      // instead of a silent permanent hang.
      let persisted: Device[] = [];
      try {
        persisted = await loadDevices();
        persisted.forEach((device) => {
          refreshCapabilities(device);
          runtime.deviceRegistry.add(device);
          attachStateBridge(device);
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("App", "Startup failed to load persisted devices — continuing with an empty list", { message });
      }
      if (cancelled) return;
      setDevices(runtime.deviceRegistry.list());
      setReady(true);

      // Reconnecting a real device (Samsung/LG especially) can mean waiting up to 30s for an
      // on-screen pairing prompt the user may not be next to right now — never block app
      // startup on that. Each device connects independently in the background; the device list
      // already shows the device either way, just with "disconnected" state until this resolves.
      // A failure here isn't the end of the story either: ADR-HEARTH-017's per-driver backoff
      // and the AppState listener above both keep retrying afterward.
      reconnectAllDevices(runtime, persisted);
    })();
    return () => {
      cancelled = true;
    };
  }, [runtime]);

  async function handleReconnect(device: Device): Promise<void> {
    const driver = runtime.driverRegistry.get(device.driverId);
    await driver?.connect(device);
    saveDeviceQuietly(device); // see reconnectAllDevices' identical comment — may carry a freshly-learned pairing key
  }

  function handleDeviceAdded(device: Device) {
    runtime.deviceRegistry.add(device);
    attachStateBridge(device);
    setDevices(runtime.deviceRegistry.list());
    setScreen({ name: "remote", device });
    saveDeviceQuietly(device);
  }

  // Real-device feedback (2026-09-10): "the name should be able to be edited" — previously fixed
  // at pairing time. Reuses deviceRegistry.add() (a Map keyed by id) to overwrite the entry rather
  // than adding a rename-specific registry method; also updates the open remote screen's own
  // `screen.device` snapshot so the header reflects the new name immediately, not just the list.
  function handleRenameDevice(device: Device, newName: string) {
    const updated: Device = { ...device, name: newName };
    runtime.deviceRegistry.add(updated);
    rebindStateBridge(updated);
    setDevices(runtime.deviceRegistry.list());
    setScreen((current) => (current.name === "remote" && current.device.id === device.id ? { name: "remote", device: updated } : current));
    saveDeviceQuietly(updated);
  }

  // Real-hardware need (2026-09-10): a device's saved IP going stale (moved to a different WiFi
  // network) shouldn't require unpairing and re-pairing from scratch — EditDeviceAddressScreen
  // already verified the new address connects before calling this. Same update-in-place pattern
  // as handleRenameDevice.
  function handleAddressUpdated(updated: Device) {
    runtime.deviceRegistry.add(updated);
    rebindStateBridge(updated);
    setDevices(runtime.deviceRegistry.list());
    setScreen({ name: "list" });
    saveDeviceQuietly(updated);
  }

  // Found in review (2026-09-10): persistence.ts's removeDevice() and DeviceRegistry.remove()
  // were both fully implemented but never called from anywhere — there was no way to actually
  // remove a paired device short of clearing the whole app's storage, e.g. after mistyping an IP.
  // Disconnecting first (best-effort — a device that's already unreachable shouldn't block its
  // own removal) stops a live socket/reconnect-backoff loop from outliving the device it belonged
  // to; the in-memory list updates immediately, persistence removal happens in the background
  // like handleDeviceAdded's own save does.
  async function handleRemoveDevice(device: Device): Promise<void> {
    const driver = runtime.driverRegistry.get(device.driverId);
    try {
      await driver?.disconnect(device);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("App", `Error disconnecting ${device.name} during removal (continuing)`, { message });
    }
    runtime.deviceRegistry.remove(device.id);
    stateBridges.get(device.id)?.();
    stateBridges.delete(device.id);
    setDevices(runtime.deviceRegistry.list());
    removeDevice(device.id).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("App", `Could not remove persisted device ${device.name}`, { message });
    });
  }

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={styles.loading}>
          <ActivityIndicator color={theme.accentEnd} size="large" />
          <StatusBar style="light" />
        </View>
      </SafeAreaProvider>
    );
  }

  const addScreenProps = {
    driverRegistry: runtime.driverRegistry,
    onCancel: () => setScreen({ name: "list" }),
    onAdded: handleDeviceAdded,
  };

  return (
    <SafeAreaProvider>
    <View style={styles.container}>
      {screen.name === "remote" && screen.device.category === "lighting" && (
        <LightControlScreen
          device={screen.device}
          commandEngine={runtime.commandEngine}
          stateStore={runtime.stateStore}
          onReconnect={() => handleReconnect(screen.device)}
          onRename={handleRenameDevice}
          onBack={() => setScreen({ name: "list" })}
        />
      )}
      {screen.name === "remote" && screen.device.category !== "lighting" && (
        <UniversalTvRemote
          device={screen.device}
          commandEngine={runtime.commandEngine}
          stateStore={runtime.stateStore}
          onReconnect={() => handleReconnect(screen.device)}
          onRename={handleRenameDevice}
          onBack={() => setScreen({ name: "list" })}
        />
      )}
      {screen.name === "add" && screen.brand === "sony" && <AddSonyDeviceScreen {...addScreenProps} />}
      {screen.name === "add" && screen.brand === "samsung" && <AddSamsungDeviceScreen {...addScreenProps} />}
      {screen.name === "add" && screen.brand === "lg" && <AddLgDeviceScreen {...addScreenProps} />}
      {screen.name === "add" && screen.brand === "roku" && <AddRokuDeviceScreen {...addScreenProps} />}
      {screen.name === "add" && screen.brand === "hue" && <AddHueDeviceScreen {...addScreenProps} />}
      {screen.name === "discover" && (
        <DiscoverDevicesScreen
          driverRegistry={runtime.driverRegistry}
          onCancel={() => setScreen({ name: "list" })}
          onAdded={handleDeviceAdded}
          onOpenSettings={() => setScreen({ name: "fcc-scan" })}
        />
      )}
      {screen.name === "fcc-scan" && (
        <ScanFamilyCommandCenterQrScreen
          onCancel={() => setScreen({ name: "list" })}
          onSaved={() => setScreen({ name: "discover" })}
          onUseManualEntry={() => setScreen({ name: "fcc-settings" })}
        />
      )}
      {screen.name === "fcc-settings" && (
        <FamilyCommandCenterSettingsScreen onCancel={() => setScreen({ name: "list" })} onSaved={() => setScreen({ name: "discover" })} />
      )}
      {screen.name === "fcc-remote" && <CommandCenterRemoteScreen onBack={() => setScreen({ name: "list" })} />}
      {screen.name === "edit-address" && (
        <EditDeviceAddressScreen
          device={screen.device}
          driverRegistry={runtime.driverRegistry}
          onCancel={() => setScreen({ name: "list" })}
          onSaved={handleAddressUpdated}
        />
      )}
      {screen.name === "list" && (
        <DeviceListScreen
          devices={devices}
          stateStore={runtime.stateStore}
          onSelect={(device) => setScreen({ name: "remote", device })}
          onAddDevice={(brand) => setScreen({ name: "add", brand })}
          onDiscover={() => setScreen({ name: "discover" })}
          onConnectFamilyCommandCenter={() => setScreen({ name: "fcc-scan" })}
          onOpenCommandCenterRemote={() => setScreen({ name: "fcc-remote" })}
          onRemove={handleRemoveDevice}
          onEditAddress={(device) => setScreen({ name: "edit-address", device })}
        />
      )}
      <StatusBar style="light" />
    </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  loading: { flex: 1, backgroundColor: theme.background, alignItems: "center", justifyContent: "center", gap: theme.spacing.md },
});
