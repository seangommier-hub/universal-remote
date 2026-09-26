import { useEffect, useState } from "react";
import { Text, TextInput } from "react-native";
import { MAX_WHO_LENGTH } from "../core/activityLog/activityLogEntry";
import { logger } from "../core/logging/logger";
import { defaultPhoneName, initPhoneName, getSavedPhoneName, setPhoneName } from "../runtime/phoneName";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { theme } from "./theme";

const LOG_SCOPE = "PhoneNameField";
const HELP_TEXT = "Shown next to what you do in the household's Recent activity. Hearth can't read your phone's own name, so type the one you'd like.";

/** "This phone is called…": the name shown beside this phone's actions in the household activity log (ADR-HEARTH-170). */
export function PhoneNameField() {
  const [name, setName] = useState("");

  useEffect(() => {
    initPhoneName()
      .then(() => setName(getSavedPhoneName()))
      .catch((err) => logger.warn(LOG_SCOPE, "could not load the phone name", { message: String(err) }));
  }, []);

  function save() {
    setPhoneName(name).catch((err) => logger.warn(LOG_SCOPE, "could not save the phone name", { message: String(err) }));
  }

  return (
    <>
      <Text style={styles.label}>This phone is called…</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        onBlur={save}
        placeholder={defaultPhoneName()}
        placeholderTextColor={theme.textTertiary}
        accessibilityLabel="This phone is called"
        maxLength={MAX_WHO_LENGTH}
      />
      <Text style={styles.hint}>{HELP_TEXT}</Text>
    </>
  );
}
