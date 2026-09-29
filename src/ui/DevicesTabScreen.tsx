import { useEffect, useState } from "react";
import { NameSourceKind } from "../discovery/deviceIdentity";
import { StyleSheet, View } from "react-native";
import { HearthRuntime } from "../runtime/bootstrap";
import { logger } from "../core/logging/logger";
import { loadFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import { Device } from "../core/types/Device";
import { Activity } from "../core/types/Activity";
import { BrandId } from "../discovery/brandRegistry";
import { DeviceListScreen } from "./DeviceListScreen";
import { KidDeviceListScreen } from "./KidDeviceListScreen";
import { GuestDeviceListScreen } from "./GuestDeviceListScreen";
import { refreshOwnRole } from "../discovery/householdPhones";
import type { KidModeControls } from "./useKidMode";
import { renderAddScreen } from "./renderAddScreen";
import { UniversalTvRemote } from "./UniversalTvRemote";
import { LightControlScreen } from "./LightControlScreen";
import { VacuumControlScreen } from "./VacuumControlScreen";
import { ENTITY_SCREEN_CATEGORIES, EntityControlScreen } from "./EntityControlScreen";
import { TeachBroadlinkCommandScreen } from "./TeachBroadlinkCommandScreen";
import { DiscoverDevicesScreen } from "./DiscoverDevicesScreen";
import { FamilyCommandCenterSettingsScreen } from "./FamilyCommandCenterSettingsScreen";
import { WhatLeavesYourHouseScreen } from "./WhatLeavesYourHouseScreen";
import { HouseholdPhonesScreen } from "./HouseholdPhonesScreen";
import { ScanFamilyCommandCenterQrScreen } from "./ScanFamilyCommandCenterQrScreen";
import { JoinWithCodeScreen } from "./JoinWithCodeScreen";
import { PairInvite } from "../discovery/pairInvite";
import { subscribeToPairInvites, takePendingPairInvite } from "./pendingPairInvite";
import { CommandCenterRemoteScreen } from "./CommandCenterRemoteScreen";
import { HomeAssistantAssistScreen } from "./HomeAssistantAssistScreen";
import { EditDeviceAddressScreen } from "./EditDeviceAddressScreen";
import { RenameDeviceScreen } from "./RenameDeviceScreen";
import { ActivityEditorScreen } from "./ActivityEditorScreen";
import { PostAddResult, PostAddScreen } from "./PostAddScreen";
import type { useActivities } from "./useActivities";
import { isShared } from "../runtime/sharedDevices";
import { demoStartingScreen } from "../demo/demoScreenRoute";
import { theme } from "./theme";

const LOG_SCOPE = "DevicesTabScreen";

export type DevicesScreen =
  | { name: "list" }
  | { name: "remote"; device: Device }
  | { name: "post-add"; device: Device; mode: "post-add" | "setup-checks" }
  | { name: "add"; brand: BrandId; initialIpAddress?: string; initialServiceUrl?: string | null }
  | { name: "discover" }
  | { name: "fcc-scan" }
  | { name: "fcc-settings" }
  | { name: "fcc-privacy" }
  | { name: "fcc-household-phones" }
  | { name: "fcc-join"; invite?: PairInvite }
  | { name: "fcc-remote" }
  | { name: "ha-assist"; instanceId: string }
  | { name: "edit-address"; device: Device }
  | { name: "rename-device"; device: Device }
  | { name: "teach-broadlink"; device: Device }
  | { name: "edit-activity"; editingActivity?: Activity };

interface DevicesTabScreenProps {
  runtime: HearthRuntime;
  devices: Device[];
  activities: ReturnType<typeof useActivities>;
  updateBanner: { status: "checking" | "downloaded" | "error" | "up-to-date" } | null;
  onCheckForUpdates: () => void;
  onApplyUpdate: () => void;
  onDismissUpdateBanner: () => void;
  onDeviceAdded: (device: Device) => Device;
  onReconnect: (device: Device) => Promise<void>;
  onRenameDevice: (device: Device, newName: string, source?: NameSourceKind) => Promise<Device>;
  onAddressUpdated: (updated: Device) => void;
  onDeviceUpdatedInPlace: (updated: Device) => void;
  onRemoveDevice: (device: Device) => Promise<void>;
  /** ADR-HEARTH-176: this phone's kid-mode state; in kid mode only the list and allowed remotes are reachable. */
  kid: KidModeControls;
}

/**
 * The "Devices" tab (ADR-HEARTH-104) — the remote-control device list, per-device remote/pairing
 * screens, and scenes, essentially unchanged from what used to be App.tsx's entire screen body.
 * Owns its own `screen` navigation state (which sub-screen is showing); everything about a
 * specific device (registry, persistence, state bridging) still lives one level up in App.tsx,
 * shared with the Feeder tab.
 */
export function DevicesTabScreen({
  runtime,
  devices,
  activities,
  updateBanner,
  onCheckForUpdates,
  onApplyUpdate,
  onDismissUpdateBanner,
  onDeviceAdded,
  onReconnect,
  onRenameDevice,
  onAddressUpdated,
  onDeviceUpdatedInPlace,
  onRemoveDevice,
  kid,
}: DevicesTabScreenProps) {
  const kidRestricted = kid.status === "restricted";
  // ADR-HEARTH-189 (phase 2): a guest-role phone gets the exact same restriction TREATMENT as kid
  // mode (only the list/remote screens reachable, only guest-allowed devices shown) but driven by
  // this phone's own token role on the Pi, not a local toggle -- there is no "leave guest mode"
  // here, unlike kid mode's PIN.
  const [guestRestricted, setGuestRestricted] = useState(false);
  const restricted = kidRestricted || guestRestricted;
  const [requestedScreen, setScreen] = useState<DevicesScreen>(() => demoStartingScreen(devices) ?? { name: "list" });
  const screen = restricted ? restrictedSafeScreen(requestedScreen) : requestedScreen;
  // Real gap found live (2026-09-21): the header's "Connect Family Command Center" button always
  // opened the QR-scan screen, meant for *first-time* pairing (a camera view + a "manual entry"
  // text link buried inside it) -- the only way this app ever exposed the settings screen at all.
  // Once Family Command Center is already configured (the common case after initial setup), a
  // household member looking for "settings" to add the new public/away URL (ADR-HEARTH-123) had
  // no direct path there and correctly reported "there is no settings" — camera-scanning to reach
  // settings you already have isn't a settings screen a user would ever find on their own. Checked
  // once on mount and re-checked after fcc-settings saves, so the button's destination (and label)
  // reflect whether this is still a first-time setup or an already-configured household.
  const [fccConfigured, setFccConfigured] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Real gap found live (2026-09-28, ADR-HEARTH-196): loadFamilyCommandCenterConfig() reads
    // SecureStore and rejects if that read throws -- a real failure mode this exact household hit
    // the same day for a different SecureStore read ("KeyChainException: User interaction is not
    // allowed"). Unhandled here, that left fccConfigured/guestRestricted on whatever they were
    // before (stale, not fatal) instead of a deliberate "couldn't tell, assume not restricted"
    // fallback; caught the same way useNetworkDevices.ts already handles this exact call.
    loadFamilyCommandCenterConfig()
      .then((config) => {
        if (cancelled) return;
        setFccConfigured(config !== null);
        setGuestRestricted(config?.role === "guest");
      })
      .catch((error) => {
        if (!cancelled) logger.warn(LOG_SCOPE, "could not read the saved Family Command Center config", { error: String(error) });
      });
    // Refreshes from the Pi in the background so a role change (promoted, demoted, or this guest
    // token's own expiry) takes effect without waiting for the next app restart; never blocks
    // rendering and is silently ignored when unreachable (refreshOwnRole never throws).
    refreshOwnRole().then((role) => {
      if (cancelled || role === null) return;
      setGuestRestricted(role === "guest");
    });
    return () => {
      cancelled = true;
    };
  }, [screen.name]);

  // ADR-HEARTH-160: a hearth://pair link only opens the Join screen prefilled (cold start picks up
  // the waiting one on mount, warm start subscribes); joining still needs a tap on its dialog.
  useEffect(() => {
    const openJoin = (invite: PairInvite) => setScreen({ name: "fcc-join", invite });
    const waiting = takePendingPairInvite();
    if (waiting) openJoin(waiting);
    return subscribeToPairInvites((invite) => {
      takePendingPairInvite();
      openJoin(invite);
    });
  }, []);

  // Screen navigation after an add/rename/edit/save is this tab's own concern (ADR-HEARTH-104) —
  // App.tsx's handlers now only do registry/persistence work and hand back the updated device.
  function handleAdded(device: Device) {
    const stored = onDeviceAdded(device);
    setScreen({ name: "post-add", device: stored, mode: "post-add" });
  }

  // ADR-HEARTH-154: applies the name and sharing choices made on the post-add screen, then opens the remote.
  async function handlePostAddDone(device: Device, mode: "post-add" | "setup-checks", result: PostAddResult): Promise<void> {
    let current = device;
    if (mode === "post-add") {
      if (result.name !== current.name) current = await onRenameDevice(current, result.name);
      if (result.shared !== isShared(current)) {
        current = { ...current, shared: result.shared };
        onDeviceUpdatedInPlace(current);
      }
    }
    setScreen(mode === "post-add" ? { name: "remote", device: current } : { name: "list" });
  }

  // ADR-HEARTH-175: a bulk import adds every device, then returns to the list instead of opening any one of them.
  function handleImported(imported: Device[]): Device[] {
    const stored = imported.map((device) => onDeviceAdded(device));
    setScreen({ name: "list" });
    return stored;
  }

  async function handleRename(device: Device, newName: string, source?: NameSourceKind): Promise<void> {
    const updated = await onRenameDevice(device, newName, source);
    setScreen((current) => (current.name === "remote" && current.device.id === device.id ? { name: "remote", device: updated } : current));
  }

  function handleAddressUpdatedAndReturnToList(updated: Device) {
    onAddressUpdated(updated);
    setScreen({ name: "list" });
  }

  function handleUpdatedInPlace(updated: Device) {
    onDeviceUpdatedInPlace(updated);
    setScreen((current) => (current.name === "teach-broadlink" && current.device.id === updated.id ? { name: "teach-broadlink", device: updated } : current));
  }

  function handleActivitySavedAndReturnToList(activity: Activity) {
    activities.saveActivity(activity);
    setScreen({ name: "list" });
  }

  function openFccSetup() {
    setScreen(fccConfigured ? { name: "fcc-settings" } : { name: "fcc-scan" });
  }

  const addScreenProps = {
    driverRegistry: runtime.driverRegistry,
    onCancel: () => setScreen({ name: "list" }),
    onAdded: handleAdded,
    onImported: handleImported,
    existingDevices: devices,
  };

  return (
    <View style={styles.container}>
      {screen.name === "remote" && screen.device.category === "lighting" && (
        <LightControlScreen
          key={screen.device.id}
          device={screen.device}
          commandEngine={runtime.commandEngine}
          stateStore={runtime.stateStore}
          onReconnect={() => onReconnect(screen.device)}
          onRename={handleRename}
          onBack={() => setScreen({ name: "list" })}
        />
      )}
      {screen.name === "remote" && screen.device.category === "vacuum" && (
        <VacuumControlScreen
          key={screen.device.id}
          device={screen.device}
          commandEngine={runtime.commandEngine}
          stateStore={runtime.stateStore}
          onReconnect={() => onReconnect(screen.device)}
          onRename={handleRename}
          onBack={() => setScreen({ name: "list" })}
        />
      )}
      {screen.name === "remote" && ENTITY_SCREEN_CATEGORIES.has(screen.device.category) && (
        <EntityControlScreen
          key={screen.device.id}
          device={screen.device}
          commandEngine={runtime.commandEngine}
          stateStore={runtime.stateStore}
          driverRegistry={runtime.driverRegistry}
          onReconnect={() => onReconnect(screen.device)}
          onRename={handleRename}
          onBack={() => setScreen({ name: "list" })}
        />
      )}
      {screen.name === "remote" && screen.device.category !== "lighting" && screen.device.category !== "vacuum" && !ENTITY_SCREEN_CATEGORIES.has(screen.device.category) && (
        <UniversalTvRemote
          // Real gap found live (2026-09-20): with no key, switching from one device's remote
          // screen to a different device's (e.g. Roku -> LG) re-rendered the SAME component
          // instance with new props instead of mounting a fresh one, relying entirely on every
          // internal effect having a correct and complete [device.id] dependency array to reset
          // state -- a real, easy-to-get-wrong pattern, and the more likely explanation for
          // Sean's live report ("the lg is getting random commands") than an actual command
          // misroute (CommandEngine/send() both resolve strictly by device.id on every call,
          // audited directly, not assumed). A key forces React to unmount/remount cleanly on any
          // device change, the same guarantee a list of items keyed by id already gets for free.
          key={screen.device.id}
          device={screen.device}
          commandEngine={runtime.commandEngine}
          stateStore={runtime.stateStore}
          onReconnect={() => onReconnect(screen.device)}
          onRename={handleRename}
          onBack={() => setScreen({ name: "list" })}
        />
      )}
      {screen.name === "post-add" && (
        <PostAddScreen
          key={screen.device.id}
          device={screen.device}
          mode={screen.mode}
          commandEngine={runtime.commandEngine}
          stateStore={runtime.stateStore}
          onDone={(result) => void handlePostAddDone(screen.device, screen.mode, result)}
        />
      )}
      {screen.name === "add" && renderAddScreen(screen.brand, { ...addScreenProps, initialIpAddress: screen.initialIpAddress, initialServiceUrl: screen.initialServiceUrl, onOpenFccSetup: openFccSetup })}
      {screen.name === "teach-broadlink" && (
        <TeachBroadlinkCommandScreen
          device={screen.device}
          onDone={() => setScreen({ name: "list" })}
          onCapabilityTaught={handleUpdatedInPlace}
        />
      )}
      {screen.name === "discover" && (
        <DiscoverDevicesScreen
          driverRegistry={runtime.driverRegistry}
          stateStore={runtime.stateStore}
          commandEngine={runtime.commandEngine}
          devices={devices}
          onCancel={() => setScreen({ name: "list" })}
          onAdded={handleAdded}
          onAddedQuietly={(device) => void onDeviceAdded(device)}
          onRenameDevice={(device, newName) => onRenameDevice(device, newName)}
          onScanQr={() => setScreen({ name: "fcc-scan" })}
          onOpenSettings={openFccSetup}
          onOpenBrandScreen={(brand, ipAddress, serviceUrl) => setScreen({ name: "add", brand, initialIpAddress: ipAddress, initialServiceUrl: serviceUrl })}
        />
      )}
      {screen.name === "fcc-scan" && (
        <ScanFamilyCommandCenterQrScreen
          onCancel={() => setScreen({ name: "list" })}
          onSaved={() => setScreen({ name: "discover" })}
          onInvite={(invite) => setScreen({ name: "fcc-join", invite })}
          onUseManualEntry={() => setScreen({ name: "fcc-settings" })}
        />
      )}
      {screen.name === "fcc-join" && <JoinWithCodeScreen key={screen.invite?.code ?? "manual"} initialInvite={screen.invite} onCancel={() => setScreen({ name: "list" })} onJoined={() => setScreen({ name: "discover" })} />}
      {screen.name === "fcc-settings" && (
        // Real gap found live (2026-09-21): always advancing to "discover" after saving made sense
        // for this screen's original only-entry-point (first-time setup via the QR-scan flow's
        // manual-entry link), but this screen is now also reached directly from the header to edit
        // an already-configured household's settings (e.g. adding the public/away URL,
        // ADR-HEARTH-123) — dropping straight into a device-discovery scan afterward would be a
        // surprising detour for that case. Back to the device list, same as Cancel, matches both.
        <FamilyCommandCenterSettingsScreen
          onCancel={() => setScreen({ name: "list" })}
          onSaved={() => setScreen({ name: "list" })}
          onJoinWithCode={() => setScreen({ name: "fcc-join" })}
          kid={kid}
          onKidModeOn={() => setScreen({ name: "list" })}
          onOpenPrivacy={() => setScreen({ name: "fcc-privacy" })}
          onOpenHouseholdPhones={() => setScreen({ name: "fcc-household-phones" })}
          devices={devices}
          onDeviceAdded={onDeviceAdded}
          onDeviceUpdated={onDeviceUpdatedInPlace}
        />
      )}
      {screen.name === "fcc-privacy" && (
        <WhatLeavesYourHouseScreen devices={devices} onDone={() => setScreen({ name: "fcc-settings" })} />
      )}
      {screen.name === "fcc-household-phones" && <HouseholdPhonesScreen onDone={() => setScreen({ name: "fcc-settings" })} />}
      {screen.name === "fcc-remote" && <CommandCenterRemoteScreen onBack={() => setScreen({ name: "list" })} />}
      {screen.name === "ha-assist" && <HomeAssistantAssistScreen instanceId={screen.instanceId} onBack={() => setScreen({ name: "list" })} />}
      {screen.name === "edit-activity" && (
        <ActivityEditorScreen
          devices={devices}
          stateStore={runtime.stateStore}
          editingActivity={screen.editingActivity}
          newActivityId={activities.newActivityId}
          onCancel={() => setScreen({ name: "list" })}
          onSaved={handleActivitySavedAndReturnToList}
          onTestRun={(draft) => activities.run(draft, "inline")}
          onCancelRun={activities.cancelRun}
          onRetryFailed={activities.retryFailed}
          onDismissRun={activities.dismissRun}
          progress={activities.progress}
          lastRun={activities.lastRun}
          memberName={activities.memberName}
          onMemberNameChange={activities.updateMemberName}
        />
      )}
      {screen.name === "edit-address" && (
        <EditDeviceAddressScreen
          device={screen.device}
          driverRegistry={runtime.driverRegistry}
          onCancel={() => setScreen({ name: "list" })}
          onSaved={handleAddressUpdatedAndReturnToList}
        />
      )}
      {screen.name === "rename-device" && (
        <RenameDeviceScreen
          device={screen.device}
          onCancel={() => setScreen({ name: "list" })}
          onSaved={(newName) => {
            handleRename(screen.device, newName);
            setScreen({ name: "list" });
          }}
        />
      )}
      {screen.name === "list" && kidRestricted && <KidDeviceListScreen devices={devices} stateStore={runtime.stateStore} commandEngine={runtime.commandEngine} kid={kid} onSelect={(device) => setScreen({ name: "remote", device })} />}
      {screen.name === "list" && !kidRestricted && guestRestricted && (
        <GuestDeviceListScreen devices={devices} stateStore={runtime.stateStore} commandEngine={runtime.commandEngine} onSelect={(device) => setScreen({ name: "remote", device })} />
      )}
      {screen.name === "list" && !restricted && (
        <DeviceListScreen
          devices={devices}
          stateStore={runtime.stateStore}
          driverRegistry={runtime.driverRegistry}
          commandEngine={runtime.commandEngine}
          onSelect={(device) => setScreen({ name: "remote", device })}
          onAddDevice={(brand) => setScreen({ name: "add", brand })}
          onOpenBrandScreen={(brand, ipAddress, serviceUrl) => setScreen({ name: "add", brand, initialIpAddress: ipAddress, initialServiceUrl: serviceUrl })}
          onQuickAdd={handleAdded}
          onDiscover={() => setScreen({ name: "discover" })}
          onConnectFamilyCommandCenter={openFccSetup}
          fccConfigured={fccConfigured}
          onJoinWithCode={() => setScreen({ name: "fcc-join" })}
          onOpenCommandCenterRemote={() => setScreen({ name: "fcc-remote" })}
          onCheckForUpdates={onCheckForUpdates}
          onOpenHomeAssistantAssist={(instanceId) => setScreen({ name: "ha-assist", instanceId })}
          updateBanner={updateBanner}
          onApplyUpdate={onApplyUpdate}
          onDismissUpdateBanner={onDismissUpdateBanner}
          onRemove={onRemoveDevice}
          onReconnect={onReconnect}
          onEditAddress={(device) => setScreen({ name: "edit-address", device })}
          onRename={(device) => setScreen({ name: "rename-device", device })}
          onTeachCommands={(device) => setScreen({ name: "teach-broadlink", device })}
          onSetupChecks={(device) => setScreen({ name: "post-add", device, mode: "setup-checks" })}
          onUseDeviceName={(device, name) => void handleRename(device, name, "device")}
          activities={activities.activities}
          activityProgress={activities.progress}
          activityHistory={activities.history}
          onRunActivity={(activity) => (activities.progress ? activities.cancelRun() : activities.run(activity))}
          onCreateActivity={() => setScreen({ name: "edit-activity" })}
          onEditActivity={(activity) => setScreen({ name: "edit-activity", editingActivity: activity })}
          onRemoveActivity={activities.removeActivity}
          newActivityId={activities.newActivityId}
          onGenerateDefaultActivities={(allOn, allOff) => {
            activities.saveActivity(allOn);
            activities.saveActivity(allOff);
          }}
        />
      )}
    </View>
  );
}

/** In kid mode or as a guest, only the list and a device's remote may be shown; anything else (setup, settings, editors) falls back to the list. */
function restrictedSafeScreen(screen: DevicesScreen): DevicesScreen {
  return screen.name === "list" || screen.name === "remote" ? screen : { name: "list" };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
});
