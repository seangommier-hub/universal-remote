import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { BrandField } from "../discovery/brandRegistry";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

const MIN_TARGET = 44;

interface DeviceInlineFieldsProps {
  fields: BrandField[];
  busy: boolean;
  onSubmit: (values: Record<string, string>) => void;
}

/** The one or two values a brand needs before it can connect (Sony PSK, Xbox Live ID), asked for right on the row. */
export function DeviceInlineFields({ fields, busy, onSubmit }: DeviceInlineFieldsProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const complete = fields.every((field) => (values[field.key] ?? "").trim().length > 0);
  return (
    <View style={styles.prompt}>
      {fields.map((field) => (
        <View key={field.key} style={styles.promptField}>
          <Text style={styles.promptLabel}>Enter the {field.label}</Text>
          <Text style={styles.promptHelp}>{field.help}</Text>
          <TextInput
            style={styles.input}
            value={values[field.key] ?? ""}
            onChangeText={(text) => setValues((current) => ({ ...current, [field.key]: text }))}
            placeholder={field.placeholder}
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={field.secret}
            accessibilityLabel={field.label}
          />
        </View>
      ))}
      <CapabilityButton label={busy ? "Connecting..." : "Connect"} variant="accent" onPress={() => onSubmit(values)} disabled={!complete || busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: { gap: theme.spacing.sm },
  promptField: { gap: theme.spacing.xs },
  promptLabel: { color: theme.textPrimary, fontSize: theme.type.label, fontWeight: "600" },
  promptHelp: { color: theme.textSecondary, fontSize: theme.type.label },
  input: { color: theme.textPrimary, backgroundColor: theme.surfaceRaised, borderRadius: theme.radius.md, padding: theme.spacing.md, fontSize: theme.type.body, minHeight: MIN_TARGET },
});
