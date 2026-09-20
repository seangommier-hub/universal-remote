import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { HearthRuntime } from "../runtime/bootstrap";
import { Device } from "../core/types/Device";
import { Scene } from "../core/types/Scene";
import { DeviceListScreen, AddableBrand } from "./DeviceListScreen";
import { UniversalTvRemote } from "./UniversalTvRemote";
import { LightControlScreen } from "./LightControlScreen";
import { AddSonyDeviceScreen } from "./AddSonyDeviceScreen";
import { AddSamsungDeviceScreen } from "./AddSamsungDeviceScreen";
import { AddLgDeviceScreen } from "./AddLgDeviceScreen";
import { AddRokuDeviceScreen } from "./AddRokuDeviceScreen";
import { AddYamahaDeviceScreen } from "./AddYamahaDeviceScreen";
import { AddSonosDeviceScreen } from "./AddSonosDeviceScreen";
import { AddPs5DeviceScreen } from "./AddPs5DeviceScreen";
import { AddDenonDeviceScreen } from "./AddDenonDeviceScreen";
import { AddChromecastDeviceScreen } from "./AddChromecastDeviceScreen";
import { AddBroadlinkHubScreen } from "./AddBroadlinkHubScreen";
import { TeachBroadlinkCommandScreen } from "./TeachBroadlinkCommandScreen";
import { AddAppleTvDeviceScreen } from "./AddAppleTvDeviceScreen";
import { AddXboxDeviceScreen } from "./AddXboxDeviceScreen";
import { AddHueDeviceScreen } from "./AddHueDeviceScreen";
import { AddSmartThingsOutletsScreen } from "./AddSmartThingsOutletsScreen";
import { AddKasaDeviceScreen } from "./AddKasaDeviceScreen";
import { DiscoverDevicesScreen } from "./DiscoverDevicesScreen";
import { FamilyCommandCenterSettingsScreen } from "./FamilyCommandCenterSettingsScreen";
import { ScanFamilyCommandCenterQrScreen } from "./ScanFamilyCommandCenterQrScreen";
import { CommandCenterRemoteScreen } from "./CommandCenterRemoteScreen";
import { EditDeviceAddressScreen } from "./EditDeviceAddressScreen";
import { RenameDeviceScreen } from "./RenameDeviceScreen";
import { CreateSceneScreen } from "./CreateSceneScreen";
import { theme } from "./theme";

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

interface DevicesTabScreenProps {
  runtime: HearthRuntime;
  devices: Device[];
  scenes: Scene[];
  updateBanner: { status: "checking" | "downloaded" | "error" | "up-to-date" } | null;
  onCheckForUpdates: () => void;
  onApplyUpdate: () => void;
  onDismissUpdateBanner: () => void;
  onDeviceAdded: (device: Device) => Device;
  onReconnect: (device: Device) => Promise<void>;
  onRenameDevice: (device: Device, newName: string) => Promise<Device>;
  onAddressUpdated: (updated: Device) => void;
  onDeviceUpdatedInPlace: (updated: Device) => void;
  onRemoveDevice: (device: Device) => Promise<void>;
  onRunScene: (scene: Scene) => Promise<void>;
  onSceneSaved: (scene: Scene) => void;
  onRemoveScene: (scene: Scene) => void;
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
  scenes,
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
  onRunScene,
  onSceneSaved,
  onRemoveScene,
}: DevicesTabScreenProps) {
  const [screen, setScreen] = useState<Screen>({ name: "list" });

  // Screen navigation after an add/rename/edit/save is this tab's own concern (ADR-HEARTH-104) —
  // App.tsx's handlers now only do registry/persistence work and hand back the updated device.
  function handleAdded(device: Device) {
    const stored = onDeviceAdded(device);
    setScreen({ name: "remote", device: stored });
  }

  async function handleRename(device: Device, newName: string): Promise<void> {
    const updated = await onRenameDevice(device, newName);
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

  function handleSceneSavedAndReturnToList(scene: Scene) {
    onSceneSaved(scene);
    setScreen({ name: "list" });
  }

  const addScreenProps = {
    driverRegistry: runtime.driverRegistry,
    onCancel: () => setScreen({ name: "list" }),
    onAdded: handleAdded,
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
      {screen.name === "remote" && screen.device.category !== "lighting" && (
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
      {screen.name === "add" && screen.brand === "appletv" && (
        <AddAppleTvDeviceScreen {...addScreenProps} initialIpAddress={screen.initialIpAddress} />
      )}
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
          onCancel={() => setScreen({ name: "list" })}
          onAdded={handleAdded}
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
          onSaved={handleSceneSavedAndReturnToList}
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
      {screen.name === "list" && (
        <DeviceListScreen
          devices={devices}
          stateStore={runtime.stateStore}
          driverRegistry={runtime.driverRegistry}
          commandEngine={runtime.commandEngine}
          onSelect={(device) => setScreen({ name: "remote", device })}
          onAddDevice={(brand) => setScreen({ name: "add", brand })}
          onAddDeviceWithIp={(brand, ipAddress) => setScreen({ name: "add", brand, initialIpAddress: ipAddress })}
          onQuickAdd={handleAdded}
          onDiscover={() => setScreen({ name: "discover" })}
          onConnectFamilyCommandCenter={() => setScreen({ name: "fcc-scan" })}
          onOpenCommandCenterRemote={() => setScreen({ name: "fcc-remote" })}
          onCheckForUpdates={onCheckForUpdates}
          updateBanner={updateBanner}
          onApplyUpdate={onApplyUpdate}
          onDismissUpdateBanner={onDismissUpdateBanner}
          onRemove={onRemoveDevice}
          onEditAddress={(device) => setScreen({ name: "edit-address", device })}
          onRename={(device) => setScreen({ name: "rename-device", device })}
          onTeachCommands={(device) => setScreen({ name: "teach-broadlink", device })}
          scenes={scenes}
          onRunScene={onRunScene}
          onCreateScene={() => setScreen({ name: "create-scene" })}
          onEditScene={(scene) => setScreen({ name: "create-scene", editingScene: scene })}
          onRemoveScene={onRemoveScene}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
});
