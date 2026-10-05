import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { logger } from "../core/logging/logger";
import { fetchRemoteSettingsPinIsSet, isValidRemoteSettingsPin, saveRemoteSettingsPin } from "../discovery/remoteSettingsPin";
import { addDeviceFormStyles as formStyles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

const LOG_SCOPE = "RemoteSettingsPinPanel";
const PIN_MAX_LENGTH = 8;
const HINT = "The physical remote asks for this PIN before anyone can add or remove its devices. Switching between devices it already has needs no PIN.";

/** Owner-only: set or change the household PIN that guards a physical remote's settings panel (ADR-HEARTH-209). */
export function RemoteSettingsPinPanel() {
  const [isSet, setIsSet] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchRemoteSettingsPinIsSet()
      .then(setIsSet)
      .catch((error) => logger.warn(LOG_SCOPE, "could not read whether a remote PIN is set", { error: String(error) }));
  }, []);

  async function save() {
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await saveRemoteSettingsPin(pin);
      setIsSet(true);
      setPin("");
      setMessage("Saved. The remote will ask for this PIN in its settings.");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text style={formStyles.title}>Remote settings PIN</Text>
      <View style={formStyles.hintCard}>
        <Text style={formStyles.hint}>{HINT}</Text>
      </View>
      <Text style={formStyles.label}>{isSet === null ? "Checking…" : isSet ? "A PIN is set. Enter a new one to change it." : "No PIN yet — set one so the remote's settings can be opened."}</Text>
      <TextInput
        style={formStyles.input}
        value={pin}
        onChangeText={(text) => setPin(text.replace(/\D/g, "").slice(0, PIN_MAX_LENGTH))}
        placeholder="4 to 8 digits"
        placeholderTextColor={theme.textTertiary}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={PIN_MAX_LENGTH}
        accessibilityLabel="Remote settings PIN"
      />
      <CapabilityButton label={busy ? "Saving…" : isSet ? "Change PIN" : "Set PIN"} variant="accent" onPress={() => void save()} disabled={busy || !isValidRemoteSettingsPin(pin)} />
      {message !== "" && <Text style={failed ? formStyles.error : formStyles.hint}>{message}</Text>}
    </View>
  );
}
