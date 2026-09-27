import { Text, View } from "react-native";
import { CapabilityButton } from "../CapabilityButton";
import { EntityControlProps } from "./entityControlTypes";
import { entityControlStyles as shared } from "./entityControlStyles";

const DEFAULT_KIND = "action";

/** One Run button for a scene, script, automation or button (they have no on/off state to show). */
export function ActionControls({ device, disabled, onPress }: EntityControlProps) {
  const kind = device.model ?? DEFAULT_KIND;
  return (
    <View style={shared.card}>
      <Text style={shared.cardLabel}>{kind.charAt(0).toUpperCase() + kind.slice(1)}</Text>
      <CapabilityButton icon="play" label="Run" variant="accent" onPress={() => onPress("trigger")} disabled={disabled} />
      <Text style={shared.hint}>Runs it once in Home Assistant.</Text>
    </View>
  );
}
