import { Text, View } from "react-native";
import { CapabilityButton } from "../CapabilityButton";
import { EntityControlProps, has } from "./entityControlTypes";
import { entityControlStyles as shared } from "./entityControlStyles";
import { PercentSlider } from "./PercentSlider";

const COVER_STATE_LABELS: Record<string, string> = { open: "Open", closed: "Closed", opening: "Opening", closing: "Closing" };

/** Open / Stop / Close buttons and a position slider for a garage door, blind or other cover. */
export function CoverControls({ device, state, disabled, onPress }: EntityControlProps) {
  const coverState = typeof state.values.coverState === "string" ? state.values.coverState : undefined;
  const position = typeof state.values.position === "number" ? state.values.position : undefined;
  return (
    <View style={shared.card}>
      <Text style={shared.cardLabel}>Status</Text>
      <Text style={shared.bigValue}>{coverState ? COVER_STATE_LABELS[coverState] ?? coverState : "Unknown"}</Text>
      <View style={shared.row}>
        {has(device, "open") && <CapabilityButton shape="circle" icon="arrow-up" label="Open" variant="accent" onPress={() => onPress("open")} disabled={disabled} />}
        {has(device, "stop") && <CapabilityButton shape="circle" icon="stop" label="Stop" onPress={() => onPress("stop")} disabled={disabled} />}
        {has(device, "close") && <CapabilityButton shape="circle" icon="arrow-down" label="Close" onPress={() => onPress("close")} disabled={disabled} />}
      </View>
      {has(device, "setPosition") && (
        <>
          <Text style={shared.cardLabel}>Position (0% closed, 100% open)</Text>
          <PercentSlider label="Position" value={position ?? 0} disabled={disabled} onCommit={(percent) => onPress("setPosition", { position: percent })} />
        </>
      )}
    </View>
  );
}
