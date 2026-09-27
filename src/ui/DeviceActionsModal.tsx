import { ReactNode, useEffect, useState } from "react";
import { Modal, Platform, Pressable, Text } from "react-native";
import { Device } from "../core/types/Device";
import { BROADLINK_IR_DRIVER_ID } from "../drivers/irHub/broadlink/BroadlinkIrDriver";
import { checksForDevice } from "../discovery/brandSetupChecks";
import { actionModalStyles as modal } from "./actionModalStyles";
import { SetRoomPanel } from "./SetRoomPanel";

export interface DeviceActionHandlers {
  onRename: (device: Device) => void;
  onUseDeviceName: (device: Device, name: string) => void;
  onEditAddress: (device: Device) => void;
  onSetupChecks: (device: Device) => void;
  onTeachCommands: (device: Device) => void;
  onRemove: (device: Device) => void;
  onToggleFavorite: (device: Device) => void;
  onSetRoom: (device: Device, room: string) => void;
  onMove: (device: Device, direction: "up" | "down") => void;
}

interface DeviceActionsModalProps {
  device: Device | null;
  nameSuggestion: string | null;
  isFavorite: boolean;
  currentRoom: string | undefined;
  roomChoices: string[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  handlers: DeviceActionHandlers;
  onClose: () => void;
}

function Option({ label, onPress, destructive, disabled }: { label: string; onPress: () => void; destructive?: boolean; disabled?: boolean }): ReactNode {
  const labelStyle = destructive ? modal.destructiveLabel : disabled ? modal.optionDisabledLabel : modal.optionLabel;
  return (
    <Pressable style={({ pressed }) => [modal.option, pressed && !disabled && modal.optionPressed]} onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}>
      <Text style={labelStyle}>{label}</Text>
    </Pressable>
  );
}

/** The long-press menu for a device: rename, room, favorite, order, address, setup, teach and remove. */
export function DeviceActionsModal({ device, nameSuggestion, isFavorite, currentRoom, roomChoices, canMoveUp, canMoveDown, handlers, onClose }: DeviceActionsModalProps) {
  const [editingRoom, setEditingRoom] = useState(false);
  useEffect(() => setEditingRoom(false), [device?.id]);

  // Runs an action after closing the menu, as every option here did before rooms existed.
  const act = (run: (d: Device) => void) => () => {
    if (!device) return;
    onClose();
    run(device);
  };
  // Moving keeps the menu open so a device can be nudged several steps in a row.
  const stay = (run: (d: Device) => void) => () => device && run(device);

  return (
    <Modal visible={device !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modal.backdrop} onPress={onClose}>
        <Pressable style={modal.card} onPress={(e) => e.stopPropagation()}>
          {device && editingRoom && (
            <SetRoomPanel
              deviceName={device.name}
              currentRoom={currentRoom}
              choices={roomChoices}
              onSave={(room) => {
                onClose();
                handlers.onSetRoom(device, room);
              }}
              onBack={() => setEditingRoom(false)}
            />
          )}
          {device && !editingRoom && (
            <>
              <Text style={modal.title}>{device.name}</Text>
              <Option label="Rename" onPress={act(handlers.onRename)} />
              {nameSuggestion && <Option label={`Use the name set on the device: "${nameSuggestion}"`} onPress={act((d) => handlers.onUseDeviceName(d, nameSuggestion))} />}
              <Option label={isFavorite ? "Remove from Favorites" : "Add to Favorites"} onPress={act(handlers.onToggleFavorite)} />
              <Option label={currentRoom ? `Set room (${currentRoom})` : "Set room"} onPress={() => setEditingRoom(true)} />
              <Option label="Move up" onPress={stay((d) => handlers.onMove(d, "up"))} disabled={!canMoveUp} />
              <Option label="Move down" onPress={stay((d) => handlers.onMove(d, "down"))} disabled={!canMoveDown} />
              {typeof device.config?.ipAddress === "string" && <Option label="Edit address" onPress={act(handlers.onEditAddress)} />}
              {checksForDevice(device, Platform.OS).length > 0 && <Option label="Setup checks" onPress={act(handlers.onSetupChecks)} />}
              {device.driverId === BROADLINK_IR_DRIVER_ID && <Option label="Teach commands" onPress={act(handlers.onTeachCommands)} />}
              <Option label="Remove" destructive onPress={act(handlers.onRemove)} />
            </>
          )}
          {!editingRoom && (
            <Pressable style={modal.cancel} onPress={onClose}>
              <Text style={modal.cancelLabel}>Cancel</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
