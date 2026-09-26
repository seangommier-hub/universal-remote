import { useCallback, useRef, useState } from "react";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { addTargetFor, AddAllSummary, RowRunResult, runAddAll } from "../discovery/addAllRunner";
import { connectBrandDevice } from "../discovery/addDeviceFlow";
import { DiscoveryRow } from "../discovery/discoveryRows";
import { useAddFlowDeps } from "./useAddFlowDeps";

export interface AddAllState {
  phase: "idle" | "running" | "done";
  /** The rows this run started with, in order; stays put as rows leave the live list once added. */
  rows: DiscoveryRow[];
  results: Record<string, RowRunResult>;
  summary: AddAllSummary | null;
}

const IDLE: AddAllState = { phase: "idle", rows: [], results: {}, summary: null };

interface Options {
  driverRegistry: DriverRegistry;
  stateStore: StateStore;
  /** Registers a connected device without opening any screen (bulk add stays on Discover). */
  onAddedQuietly: (device: Device) => void;
}

/** "Add all ready": connects every device that needs no input, one at a time, exposing per-row progress and the final summary (ADR-HEARTH-167). */
export function useAddAll({ driverRegistry, stateStore, onAddedQuietly }: Options) {
  const deps = useAddFlowDeps(driverRegistry, stateStore);
  const [state, setState] = useState<AddAllState>(IDLE);
  const running = useRef(false);

  const start = useCallback(
    async (rows: DiscoveryRow[]) => {
      if (running.current || rows.length === 0) return;
      running.current = true;
      setState({ phase: "running", rows, results: {}, summary: null });
      const summary = await runAddAll(rows, (row) => connectBrandDevice(deps, row.brand!, addTargetFor(row)), {
        onStatus: (id, result) => setState((current) => ({ ...current, results: { ...current.results, [id]: result } })),
        onAdded: onAddedQuietly,
      });
      running.current = false;
      setState((current) => ({ ...current, phase: "done", summary }));
    },
    [deps, onAddedQuietly]
  );

  const dismiss = useCallback(() => setState(IDLE), []);

  return { state, start, dismiss };
}
