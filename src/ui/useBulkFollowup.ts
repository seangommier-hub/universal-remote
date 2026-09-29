import { useCallback, useState } from "react";
import { CommandEngine } from "../core/engine/CommandEngine";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { BatchWakeRowResult, runBatchWakeTest } from "./batchWakeTest";
import { nameToCommit } from "./bulkFollowupNaming";
import { createWakeTestDependencies } from "./WakeTestRunner";

export interface BulkFollowupState {
  /** The devices this run added, in order, with any rename already reflected. Empty when nothing is open. */
  devices: Device[];
  /** The device whose name is mid-edit, or null when no row is being renamed. */
  editingId: string | null;
  draft: string;
  testing: boolean;
  results: Record<string, BatchWakeRowResult>;
}

interface Options {
  commandEngine: CommandEngine;
  stateStore: StateStore;
  onRenameDevice: (device: Device, newName: string) => Promise<Device>;
}

const CLOSED: BulkFollowupState = { devices: [], editingId: null, draft: "", testing: false, results: {} };

/**
 * Drives the post-"Add all" summary card: inline rename per row and one combined wake test across
 * the whole batch, reusing WakeTestRunner instead of a second per-device screen (ADR-HEARTH-195).
 */
export function useBulkFollowup({ commandEngine, stateStore, onRenameDevice }: Options) {
  const [state, setState] = useState<BulkFollowupState>(CLOSED);

  /** Opens the card for a freshly finished "Add all" run. */
  const present = useCallback((added: Device[]) => setState({ ...CLOSED, devices: added }), []);

  const close = useCallback(() => setState(CLOSED), []);

  const startEditing = useCallback((device: Device) => {
    setState((current) => ({ ...current, editingId: device.id, draft: device.name }));
  }, []);

  const changeDraft = useCallback((text: string) => setState((current) => ({ ...current, draft: text })), []);

  const cancelEditing = useCallback(() => setState((current) => ({ ...current, editingId: null })), []);

  const commitEditing = useCallback(async () => {
    const editingId = state.editingId;
    const device = state.devices.find((candidate) => candidate.id === editingId);
    if (!editingId || !device) return;
    setState((current) => ({ ...current, editingId: null }));
    const toCommit = nameToCommit(device.name, state.draft);
    if (toCommit === null) return;
    const updated = await onRenameDevice(device, toCommit);
    setState((current) => ({ ...current, devices: current.devices.map((candidate) => (candidate.id === editingId ? updated : candidate)) }));
  }, [onRenameDevice, state.devices, state.draft, state.editingId]);

  const testAll = useCallback(async () => {
    if (state.testing || state.devices.length === 0) return;
    setState((current) => ({ ...current, testing: true }));
    await runBatchWakeTest(state.devices, (device) => createWakeTestDependencies(device, commandEngine, stateStore), {
      onStatus: (deviceId, result) => setState((current) => ({ ...current, results: { ...current.results, [deviceId]: result } })),
    });
    setState((current) => ({ ...current, testing: false }));
  }, [commandEngine, stateStore, state.devices, state.testing]);

  return { state, present, close, startEditing, changeDraft, cancelEditing, commitEditing, testAll };
}
