import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Switch, Text, View } from "react-native";
import { classifyNetworkFailure, NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { Device } from "../core/types/Device";
import { NetworkFailureNotice } from "./NetworkFailureNotice";
import { fetchSharedDevices, publishDevices } from "../discovery/familyCommandCenterDeviceSync";
import { selectDevicesToImport } from "../runtime/selectDevicesToImport";
import { isShared, markShared, selectSharedDevices } from "../runtime/sharedDevices";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { BumpShareSection } from "./BumpShareSection";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface DeviceSharePanelProps {
  devices: Device[];
  onDeviceAdded: (device: Device) => Device;
  onDeviceUpdated: (device: Device) => void;
}

/** Share this phone's devices with the household, or load the ones another phone shared (ADR-HEARTH-129). */
export function DeviceSharePanel({ devices, onDeviceAdded, onDeviceUpdated }: DeviceSharePanelProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [failure, setFailure] = useState<NetworkFailureDiagnosis | null>(null);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setFailed(false);
    setFailure(null);
    setMessage("");
    try {
      setMessage(await action());
    } catch (err) {
      setFailed(true);
      setFailure(classifyNetworkFailure(err));
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const share = () =>
    run(async () => {
      const count = await publishDevices(selectSharedDevices(devices));
      return `Shared ${count} device${count === 1 ? "" : "s"} with the household.`;
    });

  const load = () =>
    run(async () => {
      const toImport = selectDevicesToImport(await fetchSharedDevices(), devices);
      toImport.forEach((device) => onDeviceAdded(markShared(device)));
      return toImport.length === 0 ? "Nothing new to load — this phone already has every shared device." : `Loaded ${toImport.length} shared device${toImport.length === 1 ? "" : "s"}.`;
    });

  return (
    <View>
      <Text style={styles.label}>Devices to share</Text>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>Only devices switched on here are sent to other household phones, by Share, Bump, or the automatic sync. New devices start off.</Text>
      </View>
      {devices.map((device) => (
        <View key={device.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: theme.spacing.xs }}>
          <Text style={[styles.hint, { flex: 1 }]} numberOfLines={1}>
            {device.name}
          </Text>
          <Switch value={isShared(device)} onValueChange={(value) => onDeviceUpdated({ ...device, shared: value })} />
        </View>
      ))}

      <Text style={styles.label}>Share devices between phones</Text>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>
          Share publishes this phone's devices (including their pairing keys) to your Family Command Center. On the
          other phone, Load adds any you don't already have — nothing on that phone is overwritten.
        </Text>
      </View>
      <View style={styles.row}>
        <CapabilityButton label="Share mine" variant="ghost" onPress={share} disabled={busy || devices.length === 0} />
        <CapabilityButton label="Load shared" variant="accent" onPress={load} disabled={busy} />
      </View>
      {failed && failure && failure.kind !== "unknown" && <NetworkFailureNotice diagnosis={failure} />}
      {message !== "" && !(failed && failure && failure.kind !== "unknown") && (
        <View style={failed ? styles.errorCard : styles.hintCard}>
          {failed && <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />}
          <Text style={failed ? styles.error : styles.hint}>{message}</Text>
        </View>
      )}
      <BumpShareSection devices={devices} onDeviceAdded={onDeviceAdded} />
    </View>
  );
}
