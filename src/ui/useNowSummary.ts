import { useEffect, useMemo, useState } from "react";
import { DeviceListModel } from "../core/layout/deviceGrouping";
import { StateStore } from "../core/state/StateStore";
import { buildNowRows, NowDeviceRow } from "./nowSummary";

/**
 * Live "Now" rows for the given grouped-list model (ADR-HEARTH-194), recomputed whenever any of
 * its devices' StateStore entry changes -- the same per-device subscribe/recompute pattern
 * useNowPlaying.ts already uses, so this never polls on its own.
 */
export function useNowSummary(model: DeviceListModel, stateStore: StateStore): NowDeviceRow[] {
  const devices = useMemo(() => model.sections.flatMap((section) => section.devices), [model]);
  const [rows, setRows] = useState<NowDeviceRow[]>(() => buildNowRows(model, (id) => stateStore.get(id)));

  useEffect(() => {
    function recompute() {
      setRows(buildNowRows(model, (id) => stateStore.get(id)));
    }

    recompute();
    const unsubscribes = devices.map((device) => stateStore.subscribe(device.id, recompute));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [devices, model, stateStore]);

  return rows;
}
