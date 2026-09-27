import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { BedtimeWindow, DEFAULT_BEDTIME, formatClock, isValidBedtime, parseClock } from "../core/kidMode/bedtimeWindow";
import { logger } from "../core/logging/logger";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { KidModePinModal } from "./KidModePinModal";
import { theme } from "./theme";
import { KidModeControls } from "./useKidMode";

const LOG_SCOPE = "KidModeSettingsPanel";
const HELP_TEXT = "Kid mode shows only the devices you mark 'Allowed in kid mode' (long-press a device). Leaving it needs your PIN. It applies to this phone only.";
const BEDTIME_HELP = "During bedtime, kid mode shows a calm Bedtime screen instead of remotes. Uses this phone's clock. Times are 24-hour, like 20:30.";
const BAD_TIME_TEXT = "Enter both times like 20:30, and make them different.";

interface KidModeSettingsPanelProps {
  kid: KidModeControls;
  /** Called after kid mode is switched on so the app can go back to the Devices list. */
  onKidModeOn: () => void;
}

/** Settings block: turn kid mode on for this phone (setting a PIN first time), change the PIN, and set an optional bedtime. */
export function KidModeSettingsPanel({ kid, onKidModeOn }: KidModeSettingsPanelProps) {
  const [pinMode, setPinMode] = useState<"create" | null>(null);
  const [pinPurpose, setPinPurpose] = useState<"enable" | "change">("enable");
  const [start, setStart] = useState(formatClock((kid.settings.bedtime ?? DEFAULT_BEDTIME).startMinutes));
  const [end, setEnd] = useState(formatClock((kid.settings.bedtime ?? DEFAULT_BEDTIME).endMinutes));
  const [bedtimeError, setBedtimeError] = useState("");

  async function turnOn() {
    try {
      if (await kid.vault.isPinSet()) return finishEnable();
    } catch (error) {
      logger.warn(LOG_SCOPE, "could not check for a PIN", { error: String(error) });
    }
    setPinPurpose("enable");
    setPinMode("create");
  }

  function finishEnable() {
    kid.enable();
    onKidModeOn();
  }

  function applyBedtime(window: BedtimeWindow | undefined) {
    setBedtimeError("");
    kid.setBedtime(window);
  }

  function saveBedtimeTimes() {
    const startMinutes = parseClock(start);
    const endMinutes = parseClock(end);
    const window = startMinutes === null || endMinutes === null ? null : { startMinutes, endMinutes };
    if (window && isValidBedtime(window)) applyBedtime(window);
    else setBedtimeError(BAD_TIME_TEXT);
  }

  const hasBedtime = kid.settings.bedtime !== undefined;
  return (
    <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.lg }} accessibilityLabel="Kid mode">
      <Text style={styles.label}>Kid mode</Text>
      <Text style={styles.hint}>{HELP_TEXT}</Text>
      <CapabilityButton label="Turn on kid mode" variant="accent" onPress={() => void turnOn()} />
      <CapabilityButton label="Change PIN" variant="ghost" onPress={() => { setPinPurpose("change"); setPinMode("create"); }} />
      <Text style={styles.label}>Bedtime lockout</Text>
      <Text style={styles.hint}>{BEDTIME_HELP}</Text>
      <CapabilityButton label={hasBedtime ? "Bedtime lockout is on. Turn off" : "Turn on bedtime lockout"} variant={hasBedtime ? "default" : "ghost"} onPress={() => applyBedtime(hasBedtime ? undefined : DEFAULT_BEDTIME)} />
      {hasBedtime && (
        <>
          <Text style={styles.label}>Starts</Text>
          <TextInput style={styles.input} value={start} onChangeText={setStart} onBlur={saveBedtimeTimes} placeholder="20:30" placeholderTextColor={theme.textTertiary} accessibilityLabel="Bedtime starts" />
          <Text style={styles.label}>Ends</Text>
          <TextInput style={styles.input} value={end} onChangeText={setEnd} onBlur={saveBedtimeTimes} placeholder="07:00" placeholderTextColor={theme.textTertiary} accessibilityLabel="Bedtime ends" />
          {bedtimeError !== "" && <Text style={styles.error}>{bedtimeError}</Text>}
        </>
      )}
      <KidModePinModal
        visible={pinMode !== null}
        mode="create"
        vault={kid.vault}
        onCancel={() => setPinMode(null)}
        onSuccess={() => {
          setPinMode(null);
          if (pinPurpose === "enable") finishEnable();
        }}
      />
    </View>
  );
}
