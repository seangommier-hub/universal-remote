import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { CapabilityButton } from "../CapabilityButton";
import { EntityControlProps, has } from "./entityControlTypes";
import { entityControlStyles as shared } from "./entityControlStyles";

const DEFAULT_MIN_TEMP = 7;
const DEFAULT_MAX_TEMP = 35;
const DEFAULT_STEP_CELSIUS = 0.5;
const DEFAULT_STEP_FAHRENHEIT = 1;
const FAHRENHEIT_SIGN = "°F";
const NO_UNIT = "°";
const MODE_LABELS: Record<string, string> = { off: "Off", heat: "Heat", cool: "Cool", heat_cool: "Heat/Cool", auto: "Auto", dry: "Dry", fan_only: "Fan only" };

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Target temperature with + and - (in the server's own unit) and one button per hvac mode. */
export function ClimateControls({ device, state, disabled, onPress }: EntityControlProps) {
  const { values } = state;
  const unit = typeof values.temperatureUnit === "string" ? values.temperatureUnit : NO_UNIT;
  const step = numberOr(values.step, unit === FAHRENHEIT_SIGN ? DEFAULT_STEP_FAHRENHEIT : DEFAULT_STEP_CELSIUS);
  const min = numberOr(values.minTemp, DEFAULT_MIN_TEMP);
  const max = numberOr(values.maxTemp, DEFAULT_MAX_TEMP);
  const reported = typeof values.temperature === "number" ? values.temperature : undefined;
  const current = typeof values.currentTemperature === "number" ? values.currentTemperature : undefined;
  const modes = Array.isArray(values.hvacModes) ? (values.hvacModes as string[]) : [];
  const [pending, setPending] = useState<number | null>(null);
  const target = pending ?? reported;

  useEffect(() => setPending(null), [reported]);

  function nudge(direction: 1 | -1) {
    const next = Math.max(min, Math.min(max, roundToStep((target ?? min) + direction * step, step)));
    setPending(next);
    onPress("setTemperature", { temperature: next });
  }

  return (
    <View style={shared.card}>
      {has(device, "setTemperature") && (
        <>
          <Text style={shared.cardLabel}>Target temperature</Text>
          <View style={shared.row}>
            <CapabilityButton shape="circle" icon="remove" label="Lower temperature" onPress={() => nudge(-1)} disabled={disabled || target === undefined} />
            <Text style={shared.bigValue} accessibilityLabel="Target temperature">{target === undefined ? "--" : `${target}${unit}`}</Text>
            <CapabilityButton shape="circle" icon="add" label="Raise temperature" onPress={() => nudge(1)} disabled={disabled || target === undefined} />
          </View>
        </>
      )}
      {current !== undefined && <Text style={shared.hint}>Currently {current}{unit}{typeof values.hvacAction === "string" ? `, ${values.hvacAction}` : ""}</Text>}
      {has(device, "setHvacMode") && (
        <>
          <Text style={shared.cardLabel}>Mode</Text>
          <View style={shared.wrapRow}>
            {modes.map((mode) => (
              <CapabilityButton key={mode} label={MODE_LABELS[mode] ?? mode} variant={values.hvacMode === mode ? "accent" : "default"} onPress={() => onPress("setHvacMode", { mode })} disabled={disabled} />
            ))}
          </View>
        </>
      )}
    </View>
  );
}
