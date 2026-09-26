import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BrandField } from "../discovery/brandRegistry";
import { DiscoveryRow } from "../discovery/discoveryRows";
import { CapabilityButton } from "./CapabilityButton";
import { NetworkFailureNotice } from "./NetworkFailureNotice";
import { theme } from "./theme";
import { RowUiState } from "./useAddDiscoveredDevice";

export const FCC_REQUIRED_MESSAGE = "Requires Family Command Center — set it up first.";
const ICON_SIZE = 22;
const PRIMARY_LABEL = { add: "Add", identify: "Identify", added: "Added" } as const;

interface DiscoveredDeviceRowProps {
  row: DiscoveryRow;
  ui: RowUiState;
  onPrimary: (row: DiscoveryRow) => void;
  onSubmitFields: (row: DiscoveryRow, values: Record<string, string>) => void;
  onOpenFccSetup: () => void;
}

function InlineFields({ fields, busy, onSubmit }: { fields: BrandField[]; busy: boolean; onSubmit: (values: Record<string, string>) => void }) {
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
          />
        </View>
      ))}
      <CapabilityButton label={busy ? "Connecting..." : "Connect"} variant="accent" onPress={() => onSubmit(values)} disabled={!complete || busy} />
    </View>
  );
}

/** One network device with its single primary button (Add, Identify or Added) and any inline follow-up it needs. */
export function DiscoveredDeviceRow({ row, ui, onPrimary, onSubmitFields, onOpenFccSetup }: DiscoveredDeviceRowProps) {
  const isAdded = row.action === "added";
  const icon = row.brand ? row.brand.icon : "help-circle-outline";
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.icon}>
          <Ionicons name={icon} size={ICON_SIZE} color={row.brand ? theme.accentEnd : theme.textTertiary} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {row.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {row.subtitle}
          </Text>
          {row.device.confidence === "guess" && <Text style={styles.guess}>Best guess — check before adding</Text>}
        </View>
        {isAdded ? (
          <View style={styles.addedChip}>
            <Text style={styles.addedLabel}>{PRIMARY_LABEL.added}</Text>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            onPress={() => onPrimary(row)}
            disabled={ui.busy}
            accessibilityRole="button"
            accessibilityLabel={`${PRIMARY_LABEL[row.action]} ${row.title}`}
          >
            {ui.busy ? <ActivityIndicator color={theme.background} size="small" /> : <Text style={styles.primaryLabel}>{PRIMARY_LABEL[row.action]}</Text>}
          </Pressable>
        )}
      </View>
      {ui.error && <Text style={styles.error}>{ui.error.message}</Text>}
      {ui.error?.diagnosis && <NetworkFailureNotice diagnosis={ui.error.diagnosis} />}
      {ui.needsFcc && (
        <View style={styles.fccRow}>
          <Text style={styles.error}>{FCC_REQUIRED_MESSAGE}</Text>
          <CapabilityButton label="Set up Family Command Center" variant="accent" onPress={onOpenFccSetup} />
        </View>
      )}
      {ui.fieldsNeeded && <InlineFields fields={ui.fieldsNeeded} busy={ui.busy} onSubmit={(values) => onSubmitFields(row, values)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.spacing.sm, backgroundColor: theme.surface, borderRadius: theme.radius.lg, padding: theme.spacing.lg, borderWidth: 1, borderColor: theme.border },
  topRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  icon: { width: 44, height: 44, borderRadius: theme.radius.md, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center" },
  // minWidth 0: same long-hostname overlap guard as the other cards (ADR-HEARTH-049/053).
  body: { flex: 1, minWidth: 0 },
  title: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "600" },
  meta: { color: theme.textSecondary, fontSize: theme.type.label, marginTop: theme.spacing.xs },
  guess: { color: theme.textTertiary, fontSize: theme.type.label, marginTop: theme.spacing.xs, fontStyle: "italic" },
  primary: { backgroundColor: theme.accentEnd, borderRadius: theme.radius.md, paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, minWidth: 84, alignItems: "center" },
  pressed: { opacity: 0.7 },
  primaryLabel: { color: theme.background, fontWeight: "600", fontSize: theme.type.label },
  addedChip: { borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.border, paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, minWidth: 84, alignItems: "center" },
  addedLabel: { color: theme.textTertiary, fontWeight: "600", fontSize: theme.type.label },
  error: { color: theme.statusError, fontSize: theme.type.label },
  fccRow: { gap: theme.spacing.sm },
  prompt: { gap: theme.spacing.sm },
  promptField: { gap: theme.spacing.xs },
  promptLabel: { color: theme.textPrimary, fontSize: theme.type.label, fontWeight: "600" },
  promptHelp: { color: theme.textSecondary, fontSize: theme.type.label },
  input: { color: theme.textPrimary, backgroundColor: theme.surfaceRaised, borderRadius: theme.radius.md, padding: theme.spacing.md, fontSize: theme.type.body },
});
