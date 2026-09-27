import { Text, View } from "react-native";
import { CapabilityButton } from "../CapabilityButton";
import { EntityControlProps, has } from "./entityControlTypes";
import { entityControlStyles as shared } from "./entityControlStyles";

const LOCK_STATE_LABELS: Record<string, string> = {
  locked: "Locked",
  unlocked: "Unlocked",
  open: "Open",
  locking: "Locking...",
  unlocking: "Unlocking...",
  opening: "Opening...",
  jammed: "Jammed",
};

/** Lock and Unlock buttons; the screen asks for confirmation before either is sent. Codes are never entered or stored. */
export function LockControls({ device, state, disabled, onPress }: EntityControlProps) {
  const lockState = typeof state.values.lockState === "string" ? state.values.lockState : undefined;
  return (
    <View style={shared.card}>
      <Text style={shared.cardLabel}>Status</Text>
      <Text style={shared.bigValue}>{lockState ? LOCK_STATE_LABELS[lockState] ?? lockState : "Unknown"}</Text>
      <View style={shared.row}>
        {has(device, "lock") && <CapabilityButton icon="lock-closed" label="Lock" variant="accent" onPress={() => onPress("lock")} disabled={disabled} />}
        {has(device, "unlock") && <CapabilityButton icon="lock-open" label="Unlock" onPress={() => onPress("unlock")} disabled={disabled} />}
      </View>
    </View>
  );
}
