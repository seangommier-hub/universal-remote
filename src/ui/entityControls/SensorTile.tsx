import { Text, View } from "react-native";
import { EntityControlProps } from "./entityControlTypes";
import { entityControlStyles as shared } from "./entityControlStyles";

/** A read-only tile: the sensor's current reading and unit, or "Unavailable" / "Unknown" when Home Assistant has no value. */
export function SensorTile({ state }: EntityControlProps) {
  const { values } = state;
  const availability = typeof values.availability === "string" ? values.availability : undefined;
  const reading = typeof values.reading === "string" ? values.reading : undefined;
  const unit = typeof values.unit === "string" ? values.unit : "";
  const kind = typeof values.deviceClass === "string" ? values.deviceClass.replace(/_/g, " ") : "Reading";
  const text = availability ? availability.charAt(0).toUpperCase() + availability.slice(1) : reading === undefined ? "--" : `${reading}${unit ? ` ${unit}` : ""}`;
  return (
    <View style={shared.card}>
      <Text style={shared.cardLabel}>{kind.charAt(0).toUpperCase() + kind.slice(1)}</Text>
      <Text style={shared.bigValue} accessibilityLabel={`Reading ${text}`}>{text}</Text>
      <Text style={shared.hint}>Read only. Hearth shows it; Home Assistant owns it.</Text>
    </View>
  );
}
