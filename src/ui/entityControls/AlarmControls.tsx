import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { CapabilityId } from "../../core/types/Capability";
import { CapabilityButton } from "../CapabilityButton";
import { theme } from "../theme";
import { EntityControlProps, has } from "./entityControlTypes";
import { entityControlStyles as shared } from "./entityControlStyles";

const ARM_BUTTONS: { capability: CapabilityId; label: string }[] = [
  { capability: "armHome", label: "Arm Home" },
  { capability: "armAway", label: "Arm Away" },
  { capability: "armNight", label: "Arm Night" },
];

const STATE_LABELS: Record<string, string> = {
  disarmed: "Disarmed",
  armed_home: "Armed - Home",
  armed_away: "Armed - Away",
  armed_night: "Armed - Night",
  armed_vacation: "Armed - Vacation",
  armed_custom_bypass: "Armed - Bypass",
  pending: "Pending...",
  arming: "Arming...",
  disarming: "Disarming...",
  triggered: "TRIGGERED",
};

/**
 * True when Home Assistant asks for a code before this press (ADR-HEARTH-182, developers.home-assistant.io/
 * docs/core/entity/alarm-control-panel): no `code_format` at all means the panel never takes a code; disarm
 * always takes one when the panel has a format (that is what actually secures it), arming only when
 * `code_arm_required` was not explicitly turned off.
 */
function codePromptNeeded(capability: CapabilityId, codeFormat: string | undefined, codeArmRequired: boolean): boolean {
  if (!codeFormat) return false;
  return capability === "disarm" || codeArmRequired;
}

/**
 * Arm/disarm buttons for a Home Assistant alarm_control_panel: a fresh code pad when the panel needs one,
 * a clearly distinct color per state, and (via the entity screen's own `needsConfirmation`) a confirm card
 * before anything is sent. The code lives only in this component's own state — never persisted, never logged.
 */
export function AlarmControls({ device, state, disabled, onPress }: EntityControlProps) {
  const [pendingCapability, setPendingCapability] = useState<CapabilityId | null>(null);
  const [code, setCode] = useState("");

  const alarmState = typeof state.values.alarmState === "string" ? state.values.alarmState : undefined;
  const codeFormat = typeof state.values.codeFormat === "string" ? state.values.codeFormat : undefined;
  const codeArmRequired = state.values.codeArmRequired !== false;
  const triggered = alarmState === "triggered";
  const armed = alarmState !== undefined && alarmState.startsWith("armed");

  function beginPress(capability: CapabilityId) {
    if (codePromptNeeded(capability, codeFormat, codeArmRequired)) {
      setCode("");
      setPendingCapability(capability);
    } else {
      onPress(capability);
    }
  }

  function submitCode() {
    if (!pendingCapability) return;
    onPress(pendingCapability, code ? { code } : undefined);
    setPendingCapability(null);
    setCode("");
  }

  return (
    <View style={shared.card}>
      <Text style={shared.cardLabel}>Status</Text>
      <Text style={[shared.bigValue, triggered && styles.triggered, armed && styles.armed]}>{alarmState ? (STATE_LABELS[alarmState] ?? alarmState) : "Unknown"}</Text>
      {pendingCapability ? (
        <View style={styles.codeCard}>
          <Text style={shared.cardLabel}>Enter the alarm code</Text>
          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={setCode}
            placeholder="Code"
            placeholderTextColor={theme.textTertiary}
            keyboardType={codeFormat === "number" ? "number-pad" : "default"}
            secureTextEntry
            autoFocus
            accessibilityLabel="Alarm code"
            onSubmitEditing={submitCode}
          />
          <View style={shared.row}>
            <CapabilityButton label="Cancel" variant="ghost" onPress={() => setPendingCapability(null)} />
            <CapabilityButton label="Continue" variant="accent" onPress={submitCode} disabled={code.length === 0} />
          </View>
        </View>
      ) : (
        <View style={shared.wrapRow}>
          {ARM_BUTTONS.filter(({ capability }) => has(device, capability)).map(({ capability, label }) => (
            <CapabilityButton key={capability} label={label} onPress={() => beginPress(capability)} disabled={disabled} />
          ))}
          {has(device, "disarm") && <CapabilityButton icon="shield-outline" label="Disarm" variant="accent" onPress={() => beginPress("disarm")} disabled={disabled} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  triggered: { color: theme.statusError },
  armed: { color: theme.statusOn },
  codeCard: { gap: theme.spacing.sm },
  codeInput: {
    color: theme.textPrimary,
    fontSize: theme.type.title,
    letterSpacing: 6,
    textAlign: "center",
    backgroundColor: theme.surfaceRaised,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: theme.spacing.md,
  },
});
