import { Ionicons } from "@expo/vector-icons";
import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Device } from "../core/types/Device";
import { bumpDevices } from "../discovery/familyCommandCenterBump";
import { selectDevicesToImport } from "../runtime/selectDevicesToImport";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";
import { useBumpSensor } from "./useBumpSensor";

interface BumpShareSectionProps {
  devices: Device[];
  onDeviceAdded: (device: Device) => Device;
}

/** Swap device lists with another household phone by bumping phones together, or pressing Bump on both (ADR-HEARTH-130). */
export function BumpShareSection({ devices, onDeviceAdded }: BumpShareSectionProps) {
  const [waiting, setWaiting] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  const bump = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setWaiting(true);
    setFailed(false);
    setMessage("");
    try {
      const partnerDevices = await bumpDevices(devicesRef.current);
      if (partnerDevices === null) {
        setMessage("No other phone bumped at the same time. Try again on both phones together.");
        return;
      }
      const toImport = selectDevicesToImport(partnerDevices, devicesRef.current);
      toImport.forEach((device) => onDeviceAdded(device));
      setMessage(toImport.length === 0 ? "Bumped! Nothing new — you already have all of their devices." : `Bumped! Added ${toImport.length} device${toImport.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setFailed(true);
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setWaiting(false);
    }
  }, [onDeviceAdded]);

  const motionActive = useBumpSensor(true, bump);

  return (
    <View>
      <Text style={styles.label}>Bump to share</Text>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>
          {motionActive ? "Hold both phones and bump them together. Or press" : "Open this screen on both phones and press"} Bump on both
          within a few seconds — each phone gets any devices the other has. Nothing already on a phone is overwritten.
        </Text>
      </View>
      <View style={styles.row}>
        <CapabilityButton label={waiting ? "Waiting for the other phone…" : "Bump"} variant="accent" onPress={bump} disabled={waiting} />
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
