import { useEffect, useState } from "react";
import { CapabilityId } from "../core/types/Capability";
import { Device } from "../core/types/Device";
import { has } from "./hasCapability";
import { cancelSleepTimer, getSleepTimerExpiration, startSleepTimer, subscribeSleepTimer } from "../runtime/sleepTimerManager";

export interface UniversalSleepTimer {
  /** The active timer's expiry (epoch ms), or undefined while none is running. */
  sleepExpiresAt: number | undefined;
  showSleepPicker: boolean;
  openPicker: () => void;
  closePicker: () => void;
  start: (minutes: number) => void;
  cancel: () => void;
}

/**
 * Sean, directly (2026-09-20): "there should be a method for a sleep function on any tv to be
 * easily activated." sleepTimerManager.ts is the plain in-memory countdown; this hook only
 * tracks its current expiry (for the Sleep button's active/label state) and the picker modal's
 * visibility, resyncing whenever `device.id` changes so switching devices never shows a stale
 * timer from the last one. Prefers the dedicated powerOff capability (LG/Roku) and falls back to
 * the single toggle "power" capability (Sony/Samsung) otherwise — mirrors the same preference
 * order the header's own power button already renders.
 */
export function useUniversalSleepTimer(device: Device, send: (capability: CapabilityId) => void): UniversalSleepTimer {
  const [sleepExpiresAt, setSleepExpiresAt] = useState<number | undefined>(() => getSleepTimerExpiration(device.id));
  const [showSleepPicker, setShowSleepPicker] = useState(false);

  useEffect(() => {
    // Navigating to a different device shouldn't carry over the previous device's picker or a
    // stale expiry read before this effect resubscribes.
    setShowSleepPicker(false);
    setSleepExpiresAt(getSleepTimerExpiration(device.id));
    return subscribeSleepTimer(device.id, (timerState) => setSleepExpiresAt(timerState?.expiresAt));
  }, [device.id]);

  function sendUniversalSleepPowerOff() {
    if (has(device, "powerOff")) {
      send("powerOff");
    } else if (has(device, "power")) {
      send("power");
    }
  }

  function start(minutes: number) {
    startSleepTimer(device.id, minutes, sendUniversalSleepPowerOff);
    setShowSleepPicker(false);
  }

  function cancel() {
    cancelSleepTimer(device.id);
    setShowSleepPicker(false);
  }

  return {
    sleepExpiresAt,
    showSleepPicker,
    openPicker: () => setShowSleepPicker(true),
    closePicker: () => setShowSleepPicker(false),
    start,
    cancel,
  };
}
