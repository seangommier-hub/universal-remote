import { Text, View } from "react-native";
import { CapabilityButton } from "../CapabilityButton";
import { EntityControlProps, has } from "./entityControlTypes";
import { entityControlStyles as shared } from "./entityControlStyles";
import { PercentSlider } from "./PercentSlider";

/** On/off, a speed slider (percentage) and preset buttons for a fan. */
export function FanControls({ device, state, disabled, onPress }: EntityControlProps) {
  const { values } = state;
  const isOn = values.power === "on";
  const percentage = typeof values.percentage === "number" ? values.percentage : 0;
  const presets = Array.isArray(values.presets) ? (values.presets as string[]) : [];
  return (
    <View style={shared.card}>
      {has(device, "power") && (
        <View style={shared.row}>
          <CapabilityButton shape="circle" size="lg" icon="power" label="Power" variant={isOn ? "accent" : "ghost"} onPress={() => onPress("power")} disabled={disabled} />
        </View>
      )}
      {has(device, "setFanSpeed") && (
        <>
          <Text style={shared.cardLabel}>Speed</Text>
          <PercentSlider label="Fan speed" value={isOn ? percentage : 0} disabled={disabled} onCommit={(percent) => onPress("setFanSpeed", { percentage: percent })} />
        </>
      )}
      {has(device, "setFanPreset") && presets.length > 0 && (
        <>
          <Text style={shared.cardLabel}>Mode</Text>
          <View style={shared.wrapRow}>
            {presets.map((preset) => (
              <CapabilityButton key={preset} label={preset} variant={values.preset === preset ? "accent" : "default"} onPress={() => onPress("setFanPreset", { preset })} disabled={disabled} />
            ))}
          </View>
        </>
      )}
    </View>
  );
}
