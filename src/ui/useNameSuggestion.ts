import { useEffect, useState } from "react";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { loadNameSources, suggestDeviceName } from "../discovery/deviceNameSource";

// ADR-HEARTH-156: the "Use the name set on the device" suggestion for the device long-press menu.
// Only appears when the device reports a different name and the person never renamed it in Hearth.

/** The device's own current name when it differs from the saved one and the saved one wasn't typed by the person; otherwise null. */
export function useNameSuggestion(device: Device | null, stateStore: StateStore): string | null {
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => {
    setSuggestion(null);
    if (!device) return undefined;
    let cancelled = false;
    void loadNameSources().then((sources) => {
      const reported = stateStore.get(device.id).values.deviceName;
      const next = suggestDeviceName(device.name, typeof reported === "string" ? reported : null, sources[device.id]);
      if (!cancelled) setSuggestion(next);
    });
    return () => {
      cancelled = true;
    };
  }, [device, stateStore]);

  return suggestion;
}
