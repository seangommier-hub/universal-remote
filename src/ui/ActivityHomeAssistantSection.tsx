import { Ionicons } from "@expo/vector-icons";
import { Switch, Text, TextInput, View } from "react-native";
import { ActivityHomeAssistant } from "../core/types/Activity";
import { newHomeAssistantWebhookId } from "../core/activities/haWebhookModel";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

const HA_WEBHOOK_PATH_PREFIX = "/api/integrations/hearth/ha-webhook/";
const ICON_SIZE = 20;

interface ActivityHomeAssistantSectionProps {
  config: ActivityHomeAssistant;
  onChange: (config: ActivityHomeAssistant) => void;
  /** The household's Family Command Center address, to show the full callable webhook URL; null when not configured yet. */
  fccBaseUrl: string | null;
}

function incomingUrl(fccBaseUrl: string | null, webhookId: string): string {
  return fccBaseUrl ? `${fccBaseUrl.replace(/\/+$/, "")}${HA_WEBHOOK_PATH_PREFIX}${webhookId}` : `<Family Command Center address>${HA_WEBHOOK_PATH_PREFIX}${webhookId}`;
}

/**
 * "Home Assistant" section of the Activity editor (ADR-HEARTH-183): both directions default off.
 * Incoming shows the callable webhook URL (regenerable, so a leaked one can be replaced without
 * losing the outgoing side); outgoing is a plain URL field pasted from Home Assistant's own
 * "webhook trigger" automation. Neither value is ever logged by this screen.
 */
export function ActivityHomeAssistantSection({ config, onChange, fccBaseUrl }: ActivityHomeAssistantSectionProps) {
  const incomingEnabled = Boolean(config.incomingWebhookId);

  function setIncomingEnabled(enabled: boolean) {
    onChange({ ...config, incomingWebhookId: enabled ? newHomeAssistantWebhookId() : undefined });
  }

  function regenerate() {
    onChange({ ...config, incomingWebhookId: newHomeAssistantWebhookId() });
  }

  function setOutgoingUrl(text: string) {
    const trimmed = text.trim();
    onChange({ ...config, outgoingWebhookUrl: trimmed.length > 0 ? trimmed : undefined });
  }

  return (
    <View style={haStyles.card}>
      <View style={haStyles.headerRow}>
        <Ionicons name="home-outline" size={ICON_SIZE} color={theme.accentEnd} />
        <Text style={haStyles.title}>Home Assistant</Text>
      </View>

      <View style={haStyles.row}>
        <View style={haStyles.rowText}>
          <Text style={haStyles.label}>Let Home Assistant run this Activity</Text>
          <Text style={haStyles.help}>Home Assistant calls a URL to trigger this Activity, the same steps as tapping it here.</Text>
        </View>
        <Switch value={incomingEnabled} onValueChange={setIncomingEnabled} />
      </View>
      {incomingEnabled && config.incomingWebhookId && (
        <View style={haStyles.urlBox}>
          <Text style={haStyles.urlText} selectable>
            {incomingUrl(fccBaseUrl, config.incomingWebhookId)}
          </Text>
          <CapabilityButton label="Regenerate" variant="ghost" onPress={regenerate} />
        </View>
      )}

      <View style={[haStyles.row, haStyles.rowSpaced]}>
        <View style={haStyles.rowText}>
          <Text style={haStyles.label}>Tell Home Assistant when this runs</Text>
          <Text style={haStyles.help}>Paste the URL from a Home Assistant automation with a "Webhook" trigger.</Text>
        </View>
      </View>
      <TextInput
        value={config.outgoingWebhookUrl ?? ""}
        onChangeText={setOutgoingUrl}
        placeholder="https://your-home-assistant/api/webhook/..."
        placeholderTextColor={theme.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={haStyles.input}
      />
    </View>
  );
}

const haStyles = {
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  headerRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: theme.spacing.xs },
  title: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "700" as const },
  row: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: theme.spacing.sm },
  rowSpaced: { marginTop: theme.spacing.xs },
  rowText: { flex: 1, gap: 2 },
  label: { color: theme.textPrimary, fontSize: theme.type.label, fontWeight: "600" as const },
  help: { color: theme.textTertiary, fontSize: theme.type.caption },
  urlBox: { gap: theme.spacing.xs },
  urlText: { color: theme.textSecondary, fontSize: theme.type.caption, fontFamily: "monospace" },
  input: {
    backgroundColor: theme.background,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    color: theme.textPrimary,
    fontSize: theme.type.label,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
};
