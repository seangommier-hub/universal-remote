import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, AppStateStatus, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import * as Network from "expo-network";
import { shouldReconnectOnNetworkChange } from "./src/runtime/networkReconnectPolicy";
import { createHearthRuntime } from "./src/runtime/bootstrap";
import { loadDevices, removeDevice, saveDevice } from "./src/runtime/persistence";
import { startClientLogShipper } from "./src/runtime/clientLogShipper";
import { startActivityLog } from "./src/runtime/startActivityLog";
import { runAutoDeviceSync } from "./src/runtime/autoDeviceSync";
import { markShared } from "./src/runtime/sharedDevices";
import { reconnectAllDevices } from "./src/runtime/reconnectAllDevices";
import { bridgeDeviceState } from "./src/runtime/stateStoreBridge";
import { findDuplicateDevice } from "./src/discovery/deviceIdentityMatch";
import { NameSourceKind } from "./src/discovery/deviceIdentity";
import { setNameSource } from "./src/discovery/deviceNameSource";
import { findMacByIp } from "./src/discovery/familyCommandCenterDeviceLookup";
import { applyDownloadedUpdateAsync, checkAndDownloadUpdateAsync } from "./src/runtime/appUpdates";
import { Device } from "./src/core/types/Device";
import { logger } from "./src/core/logging/logger";
import { DevicesTabScreen } from "./src/ui/DevicesTabScreen";
import { usePairLinkListener } from "./src/ui/usePairLinkListener";
import { appNavigationRef } from "./src/ui/appNavigation";
import { useActivities } from "./src/ui/useActivities";
import { ActivityRunModal } from "./src/ui/ActivityRunModal";
import { FeederTabScreen } from "./src/ui/FeederTabScreen";
import { BedtimeScreen } from "./src/ui/BedtimeScreen";
import { useKidMode } from "./src/ui/useKidMode";
import { theme } from "./src/ui/theme";
import { isDemoMode } from "./src/demo/demoMode";
import { DemoGate } from "./src/demo/DemoGate";
import { loadDemoDevices } from "./src/demo/demoRuntime";
import { IphoneSafeAreaEmulation } from "./src/web/IphoneSafeAreaEmulation";

const Tab = createBottomTabNavigator();

// Sean, directly: "the squirrel feeder is only on my build, not everyone else's, if i upload this
// to the various app stores." The Feeder tab is real, working code, but it's tied to one specific
// piece of household hardware (an ESP32 project of Sean's own) — not something a household member
// who downloads Hearth from a public app store should ever see. Reuses the same APP_VARIANT
// distinction app.config.js already draws (ADR-HEARTH-083: "production" is the one bundle
// identifier/build profile meant for eventual store distribution) rather than inventing a second
// flag — eas.json's "production" profile sets this env var to "false" explicitly; every other
// profile (development, preview — Sean's own personal builds) leaves it unset, which this
// defaults to enabled, so nothing needs to opt in for the common case.
const PERSONAL_HARDWARE_ENABLED = process.env.EXPO_PUBLIC_PERSONAL_HARDWARE_ENABLED !== "false";

/** saveDevice(), but failures are logged and swallowed rather than thrown — every call site here is a background persistence step riding along an already-successful connect(), not something that should fail the caller's own flow. */
function saveDeviceQuietly(device: Device): void {
  saveDevice(device).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("App", `Could not persist ${device.name}`, { message });
  });
}

function HearthApp() {
  const runtime = useMemo(() => createHearthRuntime(), []);
  const [ready, setReady] = useState(false);
  // ADR-HEARTH-176: per-phone kid mode (restricted device list, PIN to leave, optional bedtime screen).
  const kid = useKidMode();
  const [devices, setDevices] = useState<Device[]>([]);
  const activities = useActivities({ commandEngine: runtime.commandEngine, stateStore: runtime.stateStore });
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
  // Real bug found while wiring the Broadlink IR/RF hub driver (2026-09-20): this used to
  // unconditionally overwrite `capabilities` for every device — correct for every driver whose
  // capabilities are a pure function of the driver itself, but BroadlinkIrDriver's are taught per
  // device (grows one button at a time, see ADR-HEARTH-103) and starts empty at add-time. Syncing
  // it against `getCapabilities()`'s full teachable superset on every app launch would silently
  // "unteach" nothing but *show* every untaught button as if it worked, defeating the whole
  // "only show what's actually been learned" UX. `hasDynamicCapabilities` (DeviceDriver.ts) is the
  // explicit, driver-declared escape hatch — skipped here rather than resynced.
  function refreshCapabilities(device: Device) {
    const driver = runtime.driverRegistry.get(device.driverId);
    if (driver && !driver.hasDynamicCapabilities) device.capabilities = driver.getCapabilities();
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
        reconnectAllDevices(runtime, runtime.deviceRegistry.list(), saveDeviceQuietly);
        runUpdateCheck(false);
        syncDevicesWithHousehold();
      }
    });
    return () => subscription.remove();
  }, [runtime]);

  // ADR-HEARTH-131: converge this phone's device list with the household's shared one at startup
  // and every return to the foreground, so a new phone (or a device added on another phone) shows
  // up without anyone pressing Share/Load.
  useEffect(() => {
    if (ready) syncDevicesWithHousehold();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Real-hardware/competitive research (2026-09-16, ADR-HEARTH-075): the AppState listener above
  // only covers a device losing connection while the app is backgrounded — the one gap left is a
  // real Wi-Fi drop/handoff while the app stays in the foreground the whole time (the user is
  // actively looking at the screen), which nothing proactively noticed before now. See
  // networkReconnectPolicy.ts's own doc comment for the full research citation and the honest
  // limits of what expo-network can actually detect (no SSID/network-identity field in Expo Go,
  // so a silent same-type roam to a different access point isn't distinguishable from no change
  // at all — this covers what IS observable: connectivity lost-then-regained, and a connection
  // type change).
  // ADR-HEARTH-146: quietly ship warn/error log lines to Family Command Center for remote diagnosis.
  useEffect(() => startClientLogShipper(), []);
  // ADR-HEARTH-170: household activity log ("Sean turned off Den TV"), delivered in the background.
  useEffect(() => (isDemoMode() ? undefined : startActivityLog(runtime.activityLog)), [runtime]);
  // ADR-HEARTH-149: hearth://pair invite links + silent public-address learning.
  usePairLinkListener();

  useEffect(() => {
    const subscription = Network.addNetworkStateListener((state) => {
      if (shouldReconnectOnNetworkChange(lastNetworkState.current, state)) {
        reconnectAllDevices(runtime, runtime.deviceRegistry.list(), saveDeviceQuietly);
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
        persisted = isDemoMode() ? loadDemoDevices() : await loadDevices();
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
      runUpdateCheck(false);

      // Reconnecting a real device (Samsung/LG especially) can mean waiting up to 30s for an
      // on-screen pairing prompt the user may not be next to right now — never block app
      // startup on that. Each device connects independently in the background; the device list
      // already shows the device either way, just with "disconnected" state until this resolves.
      // A failure here isn't the end of the story either: ADR-HEARTH-017's per-driver backoff
      // and the AppState listener above both keep retrying afterward.
      reconnectAllDevices(runtime, persisted, saveDeviceQuietly);
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

  function syncDevicesWithHousehold(): void {
    runAutoDeviceSync(runtime.deviceRegistry.list(), (device) => {
      handleDeviceAdded(markShared(device));
    });
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
  //
  // ADR-HEARTH-104: returns the stored device rather than navigating anywhere itself — screen
  // navigation after an add is each tab's own concern (DevicesTabScreen opens the remote screen;
  // FeederTabScreen has nothing to navigate to, it just re-renders once the feeder device exists).
  function handleDeviceAdded(device: Device): Device {
    // ADR-HEARTH-156: matches on MAC, UUID or serial, not just MAC.
    const duplicate = findDuplicateDevice(device, runtime.deviceRegistry.list());
    // ADR-HEARTH-140: a device added on this phone stays private until its Share switch is turned on.
    const withShareFlag: Device = device.shared === undefined ? { ...device, shared: false } : device;
    const toStore: Device = duplicate ? { ...withShareFlag, id: duplicate.id, name: duplicate.name, roomId: duplicate.roomId, shared: duplicate.shared } : withShareFlag;

    runtime.deviceRegistry.add(toStore);
    if (duplicate) {
      rebindStateBridge(toStore);
    } else {
      attachStateBridge(toStore);
    }
    setDevices(runtime.deviceRegistry.list());
    saveDeviceQuietly(toStore);
    return toStore;
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
  //
  // ADR-HEARTH-104: returns the updated device instead of touching screen state itself — the
  // Devices tab (the only caller that needs to keep an open remote screen's header in sync) does
  // that with the returned value; the Feeder tab has no equivalent screen to sync.
  async function handleRenameDevice(device: Device, newName: string, source: NameSourceKind = "user"): Promise<Device> {
    void setNameSource(device.id, source); // ADR-HEARTH-156: a name typed in Hearth is never auto-suggested over
    const updated: Device = { ...device, name: newName };
    if (typeof updated.config?.hwaddr !== "string" && typeof updated.config?.ipAddress === "string") {
      const hwaddr = await findMacByIp(updated.config.ipAddress);
      if (hwaddr && updated.config) updated.config.hwaddr = hwaddr;
    }
    runtime.deviceRegistry.add(updated);
    rebindStateBridge(updated);
    setDevices(runtime.deviceRegistry.list());
    saveDeviceQuietly(updated);
    return updated;
  }

  // Real-hardware need (2026-09-10): a device's saved IP going stale (moved to a different WiFi
  // network) shouldn't require unpairing and re-pairing from scratch — EditDeviceAddressScreen
  // already verified the new address connects before calling this. Same update-in-place pattern
  // as handleRenameDevice. Navigating back to "list" afterward is the Devices tab's own concern
  // (ADR-HEARTH-104) — this only device-only-address editing is only reachable from that tab.
  function handleAddressUpdated(updated: Device) {
    runtime.deviceRegistry.add(updated);
    rebindStateBridge(updated);
    setDevices(runtime.deviceRegistry.list());
    saveDeviceQuietly(updated);
  }

  // Same persistence as handleAddressUpdated. Staying on the current screen instead of navigating
  // to "list" (TeachBroadlinkCommandScreen teaches several buttons in one sitting) is the Devices
  // tab's own concern (ADR-HEARTH-104) — the only tab this screen is reachable from.
  function handleDeviceUpdatedInPlace(updated: Device): void {
    runtime.deviceRegistry.add(updated);
    rebindStateBridge(updated);
    setDevices(runtime.deviceRegistry.list());
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

  if (!ready || !kid.ready) {
    return (
      <SafeAreaProvider>
        <IphoneSafeAreaEmulation>
          <View style={styles.loading}>
            <ActivityIndicator color={theme.accentEnd} size="large" />
            <StatusBar style="light" />
          </View>
        </IphoneSafeAreaEmulation>
      </SafeAreaProvider>
    );
  }

  if (kid.status === "bedtime" && kid.settings.bedtime) {
    return (
      <SafeAreaProvider>
        <IphoneSafeAreaEmulation>
          <BedtimeScreen kid={kid} window={kid.settings.bedtime} />
          <StatusBar style="light" />
        </IphoneSafeAreaEmulation>
      </SafeAreaProvider>
    );
  }

  // ADR-HEARTH-104: the feeder doesn't fit the remote-control device-list/remote-screen metaphor
  // (UniversalTvRemote has nothing meaningful to render for it) — it lives in its own "Feeder" tab
  // instead, so it's excluded here rather than appearing twice.
  const devicesTabDevices = devices.filter((device) => device.category !== "feeder");

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <IphoneSafeAreaEmulation>
        <NavigationContainer ref={appNavigationRef}>
          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
              tabBarActiveTintColor: theme.accentEnd,
              tabBarInactiveTintColor: theme.textTertiary,
            }}
          >
            <Tab.Screen
              name="Devices"
              options={{ tabBarIcon: ({ color, size }) => <Ionicons name="tv-outline" size={size} color={color} /> }}
            >
              {() => (
                <DevicesTabScreen
                  runtime={runtime}
                  devices={devicesTabDevices}
                  activities={activities}
                  updateBanner={updateBanner}
                  onCheckForUpdates={() => runUpdateCheck(true)}
                  onApplyUpdate={() => applyDownloadedUpdateAsync()}
                  onDismissUpdateBanner={() => setUpdateBanner(null)}
                  onDeviceAdded={handleDeviceAdded}
                  onReconnect={handleReconnect}
                  onRenameDevice={handleRenameDevice}
                  onAddressUpdated={handleAddressUpdated}
                  onDeviceUpdatedInPlace={handleDeviceUpdatedInPlace}
                  onRemoveDevice={handleRemoveDevice}
                  kid={kid}
                />
              )}
            </Tab.Screen>
            {PERSONAL_HARDWARE_ENABLED && !kid.settings.enabled && (
            <Tab.Screen name="Feeder" options={{ tabBarIcon: ({ color, size }) => <Ionicons name="paw-outline" size={size} color={color} /> }}>
              {() => (
                <FeederTabScreen
                  devices={devices}
                  driverRegistry={runtime.driverRegistry}
                  stateStore={runtime.stateStore}
                  commandEngine={runtime.commandEngine}
                  onAdded={handleDeviceAdded}
                  onReconnect={handleReconnect}
                  onRemove={handleRemoveDevice}
                />
              )}
            </Tab.Screen>
            )}
          </Tab.Navigator>
        </NavigationContainer>
        <ActivityRunModal lastRun={activities.lastRun} devices={devices} stateStore={runtime.stateStore} onRetryFailed={activities.retryFailed} onDismiss={activities.dismissRun} />
        <StatusBar style="light" />
        </IphoneSafeAreaEmulation>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** App root: the real app, held back in demo mode until demo storage is seeded (ADR-HEARTH-157). */
export default function App() {
  return (
    <DemoGate>
      <HearthApp />
    </DemoGate>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  loading: { flex: 1, backgroundColor: theme.background, alignItems: "center", justifyContent: "center", gap: theme.spacing.md },
});
