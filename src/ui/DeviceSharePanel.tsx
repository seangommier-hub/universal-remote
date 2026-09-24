import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Text, View } from "react-native";
import { Device } from "../core/types/Device";
import { fetchSharedDevices, publishDevices } from "../discovery/familyCommandCenterDeviceSync";
import { selectDevicesToImport } from "../runtime/selectDevicesToImport";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface DeviceSharePanelProps {
  devices: Device[];
  onDeviceAdded: (device: Device) => Device;
}

/** Share this phone's devices with the household, or load the ones another phone shared (ADR-HEARTH-129). */
export function DeviceSharePanel({ devices, onDeviceAdded }: DeviceSharePanelProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      setMessage(await action());
    } catch (err) {
      setFailed(true);
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const share = () =>
    run(async () => {
      const count = await publishDevices(devices);
      return `Shared ${count} device${count === 1 ? "" : "s"} with the household.`;
    });

  const load = () =>
    run(async () => {
      const toImport = selectDevicesToImport(await fetchSharedDevices(), devices);
      toImport.forEach((device) => onDeviceAdded(device));
      return toImport.length === 0 ? "Nothing new to load — this phone already has every shared device." : `Loaded ${toImport.length} shared device${toImport.length === 1 ? "" : "s"}.`;
    });

  return (
    <View>
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
      {message !== "" && (
        <View style={failed ? styles.errorCard : styles.hintCard}>
          {failed && <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />}
          <Text style={failed ? styles.error : styles.hint}>{message}</Text>
        </View>
      )}
    </View>
  );
}
