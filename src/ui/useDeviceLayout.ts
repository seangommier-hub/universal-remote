import { useCallback, useEffect, useMemo, useState } from "react";
import { logger } from "../core/logging/logger";
import { DeviceLayout, emptyLayout, pruneLayout, setDeviceRoom, toggleFavorite, toggleRoomCollapsed } from "../core/layout/deviceLayout";
import { buildDeviceListModel, DeviceListModel, sectionMateIds } from "../core/layout/deviceGrouping";
import { moveWithinGroup } from "../core/layout/deviceOrdering";
import { Device } from "../core/types/Device";
import { devicesVisibleInMode, toggleKidAllowed } from "../core/kidMode/kidModeFilter";
import { devicesVisibleToGuest, toggleGuestAllowed } from "../core/guestMode/guestModeFilter";
import { demoDeviceLayout } from "../demo/demoDeviceLayout";
import { loadDeviceLayout, saveDeviceLayout } from "../runtime/deviceLayoutPersistence";

const LOG_SCOPE = "useDeviceLayout";

export interface DeviceLayoutControls {
  layout: DeviceLayout;
  /** The devices this phone may show right now: everything, or only the kid-allowed ones in kid mode. */
  visibleDevices: Device[];
  model: DeviceListModel;
  setRoom: (device: Device, room: string) => void;
  toggleFavoriteFor: (device: Device) => void;
  toggleRoom: (key: string) => void;
  /** ADR-HEARTH-176: allows or disallows the device in kid mode. */
  toggleKidAllowedFor: (device: Device) => void;
  /** ADR-HEARTH-189: allows or disallows the device for a guest-role phone. */
  toggleGuestAllowedFor: (device: Device) => void;
  move: (device: Device, direction: "up" | "down") => void;
  /** Whether the device has a neighbor to swap with in that direction within its section. */
  canMove: (device: Device, direction: "up" | "down") => boolean;
}

/** This phone's saved rooms, favorites and order, applied to the devices shown (only the kid-allowed
 * ones when `kidRestricted`, or only the guest-allowed ones when `guestRestricted` -- a phone is
 * never expected to be both, but if it somehow were, each filter only narrows further, never
 * leaks); changes save at once. */
export function useDeviceLayout(devices: Device[], kidRestricted = false, guestRestricted = false): DeviceLayoutControls {
  const [layout, setLayout] = useState<DeviceLayout>(() => demoDeviceLayout(devices) ?? emptyLayout());
  const visibleDevices = useMemo(() => {
    const afterKid = devicesVisibleInMode(devices, layout.kidAllowed, kidRestricted);
    return devicesVisibleToGuest(afterKid, layout.guestAllowed, guestRestricted);
  }, [devices, layout.kidAllowed, layout.guestAllowed, kidRestricted, guestRestricted]);
  const model = useMemo(() => buildDeviceListModel(visibleDevices, layout), [visibleDevices, layout]);

  useEffect(() => {
    if (demoDeviceLayout(devices)) return;
    loadDeviceLayout().then(setLayout);
  }, []);

  const update = useCallback(
    (change: (current: DeviceLayout) => DeviceLayout) => {
      setLayout((current) => {
        const next = pruneLayout(change(current), devices.map((d) => d.id));
        saveDeviceLayout(next).catch((error) => logger.warn(LOG_SCOPE, "could not save device layout", { error: String(error) }));
        return next;
      });
    },
    [devices]
  );

  const setRoom = useCallback((device: Device, room: string) => update((l) => setDeviceRoom(l, device.id, room)), [update]);
  const toggleFavoriteFor = useCallback((device: Device) => update((l) => toggleFavorite(l, device.id)), [update]);
  const toggleRoom = useCallback((key: string) => update((l) => toggleRoomCollapsed(l, key)), [update]);
  const toggleKidAllowedFor = useCallback((device: Device) => update((l) => ({ ...l, kidAllowed: toggleKidAllowed(l.kidAllowed, device.id) })), [update]);
  const toggleGuestAllowedFor = useCallback((device: Device) => update((l) => ({ ...l, guestAllowed: toggleGuestAllowed(l.guestAllowed, device.id) })), [update]);
  const move = useCallback(
    (device: Device, direction: "up" | "down") => update((l) => ({ ...l, order: moveWithinGroup(l, devices, sectionMateIds(buildDeviceListModel(devices, l), device.id), device.id, direction) })),
    [update, devices]
  );
  const canMove = useCallback(
    (device: Device, direction: "up" | "down") => {
      const mates = sectionMateIds(model, device.id);
      const at = mates.indexOf(device.id);
      return direction === "up" ? at > 0 : at >= 0 && at < mates.length - 1;
    },
    [model]
  );

  return { layout, visibleDevices, model, setRoom, toggleFavoriteFor, toggleRoom, toggleKidAllowedFor, toggleGuestAllowedFor, move, canMove };
}
