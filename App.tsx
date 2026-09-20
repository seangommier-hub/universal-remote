import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, AppStateStatus, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Network from "expo-network";
import { shouldReconnectOnNetworkChange } from "./src/runtime/networkReconnectPolicy";
import { createHearthRuntime } from "./src/runtime/bootstrap";
import { loadDevices, removeDevice, saveDevice } from "./src/runtime/persistence";
import { loadScenes, removeScene, saveScene } from "./src/runtime/scenePersistence";
import { retrySceneActions, runScene, SceneRunResult } from "./src/runtime/sceneRunner";
import { bridgeDeviceState } from "./src/runtime/stateStoreBridge";
import { findMacByIp } from "./src/discovery/familyCommandCenterDeviceLookup";
import { applyDownloadedUpdateAsync, checkAndDownloadUpdateAsync } from "./src/runtime/appUpdates";
import { UpdateBanner } from "./src/ui/UpdateBanner";
import { Device } from "./src/core/types/Device";
import { Scene } from "./src/core/types/Scene";
import { logger } from "./src/core/logging/logger";
import { DeviceListScreen, AddableBrand } from "./src/ui/DeviceListScreen";
import { UniversalTvRemote } from "./src/ui/UniversalTvRemote";
import { LightControlScreen } from "./src/ui/LightControlScreen";
import { AddSonyDeviceScreen } from "./src/ui/AddSonyDeviceScreen";
import { AddSamsungDeviceScreen } from "./src/ui/AddSamsungDeviceScreen";
import { AddLgDeviceScreen } from "./src/ui/AddLgDeviceScreen";
import { AddRokuDeviceScreen } from "./src/ui/AddRokuDeviceScreen";
import { AddYamahaDeviceScreen } from "./src/ui/AddYamahaDeviceScreen";
import { AddSonosDeviceScreen } from "./src/ui/AddSonosDeviceScreen";
import { AddPs5DeviceScreen } from "./src/ui/AddPs5DeviceScreen";
import { AddDenonDeviceScreen } from "./src/ui/AddDenonDeviceScreen";
import { AddChromecastDeviceScreen } from "./src/ui/AddChromecastDeviceScreen";
import { AddBroadlinkHubScreen } from "./src/ui/AddBroadlinkHubScreen";
import { TeachBroadlinkCommandScreen } from "./src/ui/TeachBroadlinkCommandScreen";
import { AddXboxDeviceScreen } from "./src/ui/AddXboxDeviceScreen";
import { AddHueDeviceScreen } from "./src/ui/AddHueDeviceScreen";
import { AddSmartThingsOutletsScreen } from "./src/ui/AddSmartThingsOutletsScreen";
import { AddKasaDeviceScreen } from "./src/ui/AddKasaDeviceScreen";
import { DiscoverDevicesScreen } from "./src/ui/DiscoverDevicesScreen";
import { FamilyCommandCenterSettingsScreen } from "./src/ui/FamilyCommandCenterSettingsScreen";
import { ScanFamilyCommandCenterQrScreen } from "./src/ui/ScanFamilyCommandCenterQrScreen";
import { CommandCenterRemoteScreen } from "./src/ui/CommandCenterRemoteScreen";
import { EditDeviceAddressScreen } from "./src/ui/EditDeviceAddressScreen";
import { RenameDeviceScreen } from "./src/ui/RenameDeviceScreen";
import { CreateSceneScreen } from "./src/ui/CreateSceneScreen";
import { theme } from "./src/ui/theme";

type Screen =
  | { name: "list" }
  | { name: "remote"; device: Device }
  | { name: "add"; brand: AddableBrand; initialIpAddress?: string }
  | { name: "discover" }
  | { name: "fcc-scan" }
  | { name: "fcc-settings" }
  | { name: "fcc-remote" }
  | { name: "edit-address"; device: Device }
  | { name: "rename-device"; device: Device }
  | { name: "teach-broadlink"; device: Device }
  | { name: "create-scene"; editingScene?: Scene };

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
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [screen, setScreen] = useState<Screen>({ name: "list" });
  // ADR-HEARTH-084/086: "checking"/"error" only ever come from a manual check (DeviceListScreen's
  // header button) — the automatic launch/foreground check below stays silent unless it actually
  // finds something, so opening the app doesn't flash a banner nearly every time for nothing.
  const [updateBanner, setUpdateBanner] = useState<{ status: "checking" | "downloaded" | "error" | "up-to-date" } | null>(null);
  const updateBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appState = useRef(AppState.currentState);
  const lastNetworkState = useRef<Network.NetworkState | null>(null);
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
        runUpdateCheck(false);
      }
    });
    return () => subscription.remove();
  }, [runtime]);

  // Real-hardware/competitive research (2026-09-16, ADR-HEARTH-075): the AppState listener above
  // only covers a device losing connection while the app is backgrounded — the one gap left is a
  // real Wi-Fi drop/handoff while the app stays in the foreground the whole time (the user is
  // actively looking at the screen), which nothing proactively noticed before now. See
  // networkReconnectPolicy.ts's own doc comment for the full research citation and the honest
  // limits of what expo-network can actually detect (no SSID/network-identity field in Expo Go,
  // so a silent same-type roam to a different access point isn't distinguishable from no change
  // at all — this covers what IS observable: connectivity lost-then-regained, and a connection
  // type change).
  useEffect(() => {
    const subscription = Network.addNetworkStateListener((state) => {
      if (shouldReconnectOnNetworkChange(lastNetworkState.current, state)) {
        reconnectAllDevices(runtime, runtime.deviceRegistry.list());
      }
      lastNetworkState.current = state;
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
      try {
        setScenes(await loadScenes());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn("App", "Could not load persisted scenes — continuing with an empty list", { message });
      }
      if (cancelled) return;
      setDevices(runtime.deviceRegistry.list());
      setReady(true);
      runUpdateCheck(false);

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

  // ADR-HEARTH-084/086: `manual` controls whether "checking"/"nothing found"/"error" are shown at
  // all — the automatic launch/foreground call passes false and only ever surfaces a "downloaded"
  // banner, so a normal app open stays silent; DeviceListScreen's header button passes true so
  // tapping it always gives visible feedback either way, matching Sean's "a true update button"
  // ask for the test/dev side of this.
  async function runUpdateCheck(manual: boolean): Promise<void> {
    if (updateBannerTimer.current) clearTimeout(updateBannerTimer.current);
    if (manual) setUpdateBanner({ status: "checking" });
    const outcome = await checkAndDownloadUpdateAsync();
    if (outcome === "downloaded") {
      setUpdateBanner({ status: "downloaded" });
    } else if (manual && outcome === "error") {
      setUpdateBanner({ status: "error" });
    } else if (manual && outcome === "no-update") {
      setUpdateBanner({ status: "up-to-date" });
      updateBannerTimer.current = setTimeout(() => setUpdateBanner(null), 2500);
    } else if (manual) {
      setUpdateBanner(null); // "not-supported" (Expo Go / a build without expo-updates baked in)
    }
  }

  async function handleReconnect(device: Device): Promise<void> {
    const driver = runtime.driverRegistry.get(device.driverId);
    await driver?.connect(device);
    saveDeviceQuietly(device); // see reconnectAllDevices' identical comment — may carry a freshly-learned pairing key
  }

  // ADR-HEARTH-085: the same physical device can reach this function twice — re-discovered after
  // an IP change before its own driver's reconnect logic caught up, or added once via Discover and
  // again manually as a (possibly different) brand — and nothing before this compared identities
  // across ids, so it just kept adding a second card. `hwaddr` is the one identity discovery
  // already treats as stable (FamilyCommandCenterDiscoveryProvider's `fcc-${hwaddr}` id,
  // LgWebOsDriver's re-discovery); a match there means "this is the same device," so the existing
  // entry's id/name/room are kept (preserving any rename the user already did) and only its
  // connection info refreshes, rather than creating a duplicate. A device with no hwaddr (every
  // manually-added device without a backfilled one yet) can't be checked this way and is added
  // as-is, same as before — no regression for that case, just no new protection either.
  function handleDeviceAdded(device: Device) {
    const hwaddr = typeof device.config?.hwaddr === "string" ? device.config.hwaddr : undefined;
    const duplicate = hwaddr
      ? runtime.deviceRegistry
          .list()
          .find((d) => d.id !== device.id && typeof d.config?.hwaddr === "string" && d.config.hwaddr.toLowerCase() === hwaddr.toLowerCase())
      : undefined;
    const toStore: Device = duplicate ? { ...device, id: duplicate.id, name: duplicate.name, roomId: duplicate.roomId } : device;

    runtime.deviceRegistry.add(toStore);
    if (duplicate) {
      rebindStateBridge(toStore);
    } else {
      attachStateBridge(toStore);
    }
    setDevices(runtime.deviceRegistry.list());
    setScreen({ name: "remote", device: toStore });
    saveDeviceQuietly(toStore);
  }

  // Real-device feedback (2026-09-10): "the name should be able to be edited" — previously fixed
  // at pairing time. Reuses deviceRegistry.add() (a Map keyed by id) to overwrite the entry rather
  // than adding a rename-specific registry method; also updates the open remote screen's own
  // `screen.device` snapshot so the header reflects the new name immediately, not just the list.
  //
  // ADR-HEARTH-085: a device with no `hwaddr` on file re-locates itself after an IP change by
  // matching its saved `name` against the Family Command Center's inventory
  // (familyCommandCenterDeviceLookup.ts's findCurrentIpByName) — renaming such a device would
  // silently break that fallback forever, with nothing telling the user why reconnect stopped
  // working later. Backfilling `hwaddr` here (same lookup EditDeviceAddressScreen already uses)
  // neutralizes it going forward, the same "fix it by hand once, self-heal after" pattern.
  async function handleRenameDevice(device: Device, newName: string): Promise<void> {
    const updated: Device = { ...device, name: newName };
    if (typeof updated.config?.hwaddr !== "string" && typeof updated.config?.ipAddress === "string") {
      const hwaddr = await findMacByIp(updated.config.ipAddress);
      if (hwaddr && updated.config) updated.config.hwaddr = hwaddr;
    }
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

  // Same persistence as handleAddressUpdated, but stays on the current screen instead of
  // navigating to "list" — TeachBroadlinkCommandScreen teaches several buttons in one sitting, and
  // bouncing back to the device list after every single learned code would make that unusable.
  function handleDeviceUpdatedInPlace(updated: Device): void {
    runtime.deviceRegistry.add(updated);
    rebindStateBridge(updated);
    setDevices(runtime.deviceRegistry.list());
    setScreen((current) => (current.name === "teach-broadlink" && current.device.id === updated.id ? { name: "teach-broadlink", device: updated } : current));
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

  // ADR-HEARTH-056/058. Same in-memory-first, persist-in-background pattern as handleDeviceAdded.
  // Upserts by id — covers both a brand-new scene and CreateSceneScreen's edit mode saving back
  // over an existing one, the same "add or overwrite" shape scenePersistence.saveScene already uses.
  function handleSceneSaved(scene: Scene) {
    setScenes((current) => [...current.filter((s) => s.id !== scene.id), scene]);
    setScreen({ name: "list" });
    saveScene(scene).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("App", `Could not persist scene ${scene.name}`, { message });
    });
  }

  function handleRemoveScene(scene: Scene) {
    setScenes((current) => current.filter((s) => s.id !== scene.id));
    removeScene(scene.id).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("App", `Could not remove persisted scene ${scene.name}`, { message });
    });
  }

  // Runs every action in the scene, then surfaces a plain pass/fail summary — a Scene has no
  // dedicated screen of its own to show progress in, and it's triggered straight from the home
  // screen's chip, so an Alert is the simplest honest feedback for "did this actually work"
  // without building a whole results UI for what's still a v1 feature (ADR-HEARTH-056).
  async function handleRunScene(scene: Scene): Promise<void> {
    const result = await runScene(scene, runtime.commandEngine);
    presentSceneResult(scene.name, result, scene.actions.length, result.succeeded);
  }

  // Real UX research (2026-09-16, ADR-HEARTH-073): Logitech Harmony's own "Help" feature — widely
  // praised in reviews — re-sends just the specific out-of-sync step rather than re-running an
  // entire activity from scratch. `totalActions`/`cumulativeSucceeded` are threaded through
  // explicitly (not re-derived from `result` alone) so a retry's own alert can still say "4 of 4
  // actions ran" against the scene's real original total, not "1 of 1" against just the retry.
  function presentSceneResult(sceneName: string, result: SceneRunResult, totalActions: number, cumulativeSucceeded: number): void {
    if (result.failed.length === 0) return;
    const failureLines = result.failed.map((f) => `${f.deviceId}: ${f.message}`).join("\n");
    Alert.alert(`${sceneName}: ${cumulativeSucceeded} of ${totalActions} actions ran`, failureLines, [
      { text: "Dismiss", style: "cancel" },
      {
        text: "Retry Failed",
        onPress: () => {
          retrySceneActions(result.failed, runtime.commandEngine, sceneName).then((retryResult) => {
            presentSceneResult(sceneName, retryResult, totalActions, cumulativeSucceeded + retryResult.succeeded);
          });
        },
      },
    ]);
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
      {screen.name === "add" && screen.brand === "sony" && (
        <AddSonyDeviceScreen {...addScreenProps} initialIpAddress={screen.initialIpAddress} />
      )}
      {screen.name === "add" && screen.brand === "samsung" && (
        <AddSamsungDeviceScreen {...addScreenProps} initialIpAddress={screen.initialIpAddress} />
      )}
      {screen.name === "add" && screen.brand === "lg" && <AddLgDeviceScreen {...addScreenProps} initialIpAddress={screen.initialIpAddress} />}
      {screen.name === "add" && screen.brand === "roku" && (
        <AddRokuDeviceScreen {...addScreenProps} initialIpAddress={screen.initialIpAddress} />
      )}
      {screen.name === "add" && screen.brand === "yamaha" && (
        <AddYamahaDeviceScreen {...addScreenProps} initialIpAddress={screen.initialIpAddress} />
      )}
      {screen.name === "add" && screen.brand === "hue" && <AddHueDeviceScreen {...addScreenProps} />}
      {screen.name === "add" && screen.brand === "smartthings" && <AddSmartThingsOutletsScreen {...addScreenProps} />}
      {screen.name === "add" && screen.brand === "xbox" && (
        <AddXboxDeviceScreen {...addScreenProps} initialIpAddress={screen.initialIpAddress} />
      )}
      {screen.name === "add" && screen.brand === "kasa" && (
        <AddKasaDeviceScreen {...addScreenProps} initialIpAddress={screen.initialIpAddress} />
      )}
      {screen.name === "add" && screen.brand === "sonos" && (
        <AddSonosDeviceScreen {...addScreenProps} initialIpAddress={screen.initialIpAddress} />
      )}
      {screen.name === "add" && screen.brand === "ps5" && (
        <AddPs5DeviceScreen {...addScreenProps} initialIpAddress={screen.initialIpAddress} />
      )}
      {screen.name === "add" && screen.brand === "denon" && (
        <AddDenonDeviceScreen {...addScreenProps} initialIpAddress={screen.initialIpAddress} />
      )}
      {screen.name === "add" && screen.brand === "chromecast" && (
        <AddChromecastDeviceScreen {...addScreenProps} initialIpAddress={screen.initialIpAddress} />
      )}
      {screen.name === "add" && screen.brand === "broadlink" && (
        <AddBroadlinkHubScreen {...addScreenProps} initialIpAddress={screen.initialIpAddress} />
      )}
      {screen.name === "teach-broadlink" && (
        <TeachBroadlinkCommandScreen
          device={screen.device}
          onDone={() => setScreen({ name: "list" })}
          onCapabilityTaught={handleDeviceUpdatedInPlace}
        />
      )}
      {screen.name === "discover" && (
        <DiscoverDevicesScreen
          driverRegistry={runtime.driverRegistry}
          stateStore={runtime.stateStore}
          onCancel={() => setScreen({ name: "list" })}
          onAdded={handleDeviceAdded}
          onOpenSettings={() => setScreen({ name: "fcc-scan" })}
          onAddManually={(brand, ipAddress) => setScreen({ name: "add", brand, initialIpAddress: ipAddress })}
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
      {screen.name === "create-scene" && (
        <CreateSceneScreen
          devices={devices}
          stateStore={runtime.stateStore}
          editingScene={screen.editingScene}
          onCancel={() => setScreen({ name: "list" })}
          onSaved={handleSceneSaved}
        />
      )}
      {screen.name === "edit-address" && (
        <EditDeviceAddressScreen
          device={screen.device}
          driverRegistry={runtime.driverRegistry}
          onCancel={() => setScreen({ name: "list" })}
          onSaved={handleAddressUpdated}
        />
      )}
      {screen.name === "rename-device" && (
        <RenameDeviceScreen
          device={screen.device}
          onCancel={() => setScreen({ name: "list" })}
          onSaved={(newName) => {
            handleRenameDevice(screen.device, newName);
            setScreen({ name: "list" });
          }}
        />
      )}
      {screen.name === "list" && (
        <DeviceListScreen
          devices={devices}
          stateStore={runtime.stateStore}
          driverRegistry={runtime.driverRegistry}
          commandEngine={runtime.commandEngine}
          onSelect={(device) => setScreen({ name: "remote", device })}
          onAddDevice={(brand) => setScreen({ name: "add", brand })}
          onAddDeviceWithIp={(brand, ipAddress) => setScreen({ name: "add", brand, initialIpAddress: ipAddress })}
          onQuickAdd={handleDeviceAdded}
          onDiscover={() => setScreen({ name: "discover" })}
          onConnectFamilyCommandCenter={() => setScreen({ name: "fcc-scan" })}
          onOpenCommandCenterRemote={() => setScreen({ name: "fcc-remote" })}
          onCheckForUpdates={() => runUpdateCheck(true)}
          updateBanner={updateBanner}
          onApplyUpdate={() => applyDownloadedUpdateAsync()}
          onDismissUpdateBanner={() => setUpdateBanner(null)}
          onRemove={handleRemoveDevice}
          onEditAddress={(device) => setScreen({ name: "edit-address", device })}
          onRename={(device) => setScreen({ name: "rename-device", device })}
          onTeachCommands={(device) => setScreen({ name: "teach-broadlink", device })}
          scenes={scenes}
          onRunScene={handleRunScene}
          onCreateScene={() => setScreen({ name: "create-scene" })}
          onEditScene={(scene) => setScreen({ name: "create-scene", editingScene: scene })}
          onRemoveScene={handleRemoveScene}
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
