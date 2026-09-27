import { Device } from "../types/Device";
import { DeviceLayout } from "./deviceLayout";

/** Devices in the person's saved order; devices never moved keep their original relative order after the moved ones. */
export function applyDeviceOrder<T extends Pick<Device, "id">>(devices: readonly T[], order: readonly string[]): T[] {
  const position = new Map(order.map((id, index) => [id, index]));
  const withIndex = devices.map((device, original) => ({ device, original }));
  withIndex.sort((a, b) => {
    const pa = position.get(a.device.id);
    const pb = position.get(b.device.id);
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return a.original - b.original;
  });
  return withIndex.map((entry) => entry.device);
}

/** Moves one device a step earlier or later among the given group (the devices sharing its section), returning the new full order. */
export function moveWithinGroup(layout: DeviceLayout, allDevices: readonly Device[], groupIds: readonly string[], deviceId: string, direction: "up" | "down"): string[] {
  const fullOrder = applyDeviceOrder(allDevices, layout.order).map((d) => d.id);
  const inGroup = new Set(groupIds);
  const groupInOrder = fullOrder.filter((id) => inGroup.has(id));
  const at = groupInOrder.indexOf(deviceId);
  const neighborId = groupInOrder[direction === "up" ? at - 1 : at + 1];
  if (at < 0 || neighborId === undefined) return fullOrder;
  const next = [...fullOrder];
  const a = next.indexOf(deviceId);
  const b = next.indexOf(neighborId);
  next[a] = neighborId;
  next[b] = deviceId;
  return next;
}
