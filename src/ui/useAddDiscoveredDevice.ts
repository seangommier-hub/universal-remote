import { useCallback, useMemo, useState } from "react";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { AddFlowDependencies, AddTarget, AddOutcome, connectBrandDevice } from "../discovery/addDeviceFlow";
import { BrandEntry, BrandField, BrandId, getBrand } from "../discovery/brandRegistry";
import { NetworkDevice } from "../discovery/discoverAll";
import { DiscoveryRow, reidentify } from "../discovery/discoveryRows";
import { setNameSource } from "../discovery/deviceNameSource";
import { loadFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import { identifyDeviceByIp } from "../discovery/identifyDevice";

/** What one row is currently showing besides its normal state. */
export interface RowUiState {
  busy: boolean;
  error: { message: string; diagnosis: NetworkFailureDiagnosis | null } | null;
  /** Inline fields the user still has to fill in (Sony PSK, Xbox Live ID). */
  fieldsNeeded: BrandField[] | null;
  needsFcc: boolean;
}

const IDLE: RowUiState = { busy: false, error: null, fieldsNeeded: null, needsFcc: false };

interface Options {
  driverRegistry: DriverRegistry;
  stateStore: StateStore;
  onAdded: (device: Device) => void;
  /** Opens a brand's own multi-step screen with the address prefilled. */
  onOpenBrandScreen: (brand: BrandId, ipAddress: string) => void;
  /** Called when a re-identify pass found a brand for a previously unknown device. */
  onIdentified: (device: NetworkDevice) => void;
  rescan: () => Promise<NetworkDevice[]>;
}

function hintsFromRow(row: DiscoveryRow): NonNullable<AddTarget["hints"]> {
  const { friendlyName, hostname, vendor, model } = row.device;
  return { friendlyName, hostname, vendor, model };
}

/** Shared "one button per row" behaviour for the Discover screen and the home Suggested list (ADR-HEARTH-148). */
export function useAddDiscoveredDevice(options: Options) {
  const { driverRegistry, stateStore, onAdded, onOpenBrandScreen, onIdentified, rescan } = options;
  const [uiById, setUiById] = useState<Record<string, RowUiState>>({});
  const [chosenBrand, setChosenBrand] = useState<Record<string, BrandId>>({});
  const [pickerRow, setPickerRow] = useState<DiscoveryRow | null>(null);

  const deps = useMemo<AddFlowDependencies>(
    () => ({
      driverRegistry,
      readReportedName: (id) => {
        const value = stateStore.get(id).values.deviceName;
        return typeof value === "string" ? value : undefined;
      },
      hasFccConfig: async () => (await loadFamilyCommandCenterConfig()) !== null,
      identify: identifyDeviceByIp,
      recordNameSource: (id, source) => void setNameSource(id, source),
    }),
    [driverRegistry, stateStore]
  );

  const setUi = useCallback((id: string, next: Partial<RowUiState>) => {
    setUiById((current) => ({ ...current, [id]: { ...IDLE, ...next } }));
  }, []);

  const applyOutcome = useCallback(
    (row: DiscoveryRow, brand: BrandEntry, outcome: AddOutcome) => {
      const id = row.device.id;
      if (outcome.kind === "added" || outcome.kind === "custom-screen") setUi(id, {});
      if (outcome.kind === "added") return onAdded(outcome.device);
      if (outcome.kind === "custom-screen") return onOpenBrandScreen(brand.id, row.device.ip);
      if (outcome.kind === "needs-fcc") return setUi(id, { needsFcc: true });
      if (outcome.kind === "needs-fields") return setUi(id, { fieldsNeeded: outcome.fields });
      setUi(id, { error: { message: outcome.message, diagnosis: outcome.diagnosis } });
    },
    [onAdded, onOpenBrandScreen, setUi]
  );

  const startAdd = useCallback(
    async (row: DiscoveryRow, brand: BrandEntry, fieldValues?: Record<string, string>) => {
      setUi(row.device.id, { busy: true });
      const target = { id: row.device.id, ipAddress: row.device.ip, hwaddr: row.device.mac, fieldValues, hints: hintsFromRow(row) };
      applyOutcome(row, brand, await connectBrandDevice(deps, brand, target));
    },
    [applyOutcome, deps, setUi]
  );

  const identify = useCallback(
    async (row: DiscoveryRow) => {
      setUi(row.device.id, { busy: true });
      const found = await reidentify(row, rescan).catch(() => null);
      if (found) {
        setUi(row.device.id, {});
        return onIdentified(found);
      }
      setUi(row.device.id, {});
      setPickerRow(row);
    },
    [onIdentified, rescan, setUi]
  );

  const press = useCallback(
    (row: DiscoveryRow) => {
      if (row.action === "added") return;
      const brand = chosenBrand[row.device.id] ? getBrand(chosenBrand[row.device.id]) : row.brand;
      if (brand) void startAdd(row, brand);
      else void identify(row);
    },
    [chosenBrand, identify, startAdd]
  );

  const submitFields = useCallback(
    (row: DiscoveryRow, values: Record<string, string>) => {
      const brand = chosenBrand[row.device.id] ? getBrand(chosenBrand[row.device.id]) : row.brand;
      if (brand) void startAdd(row, brand, values);
    },
    [chosenBrand, startAdd]
  );

  const pickBrand = useCallback(
    (brand: BrandEntry) => {
      const row = pickerRow;
      setPickerRow(null);
      if (!row) return;
      setChosenBrand((current) => ({ ...current, [row.device.id]: brand.id }));
      void startAdd(row, brand);
    },
    [pickerRow, startAdd]
  );

  return {
    uiFor: (id: string): RowUiState => uiById[id] ?? IDLE,
    press,
    submitFields,
    pickerRow,
    pickBrand,
    closePicker: () => setPickerRow(null),
  };
}
