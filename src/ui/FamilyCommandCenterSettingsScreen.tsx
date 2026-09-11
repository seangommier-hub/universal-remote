import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadFamilyCommandCenterConfig, verifyAndSaveFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface FamilyCommandCenterSettingsScreenProps {
  onCancel: () => void;
  onSaved: () => void;
}

/**
 * One-time setup for the Family Command Center discovery integration
 * (ADR-HEARTH-010): the household's own base URL and the shared bearer
 * token it issued. Verifies the connection actually works (a real
 * unauthenticated GET would 401/503) before saving, rather than accepting
 * whatever was typed and failing silently the next time Discover runs.
 */
export function FamilyCommandCenterSettingsScreen({ onCancel, onSaved }: FamilyCommandCenterSettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const [baseUrl, setBaseUrl] = useState("http://192.168.1.172:3210");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadFamilyCommandCenterConfig().then((existing) => {
      if (existing) {
        setBaseUrl(existing.baseUrl);
        setToken(existing.token);
      }
    });
  }, []);

  async function handleSave() {
    setStatus("checking");
    setErrorMessage("");
    try {
      await verifyAndSaveFamilyCommandCenterConfig(baseUrl, token);
      onSaved();
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  const canSubmit = baseUrl.trim().length > 0 && token.trim().length > 0 && status !== "checking";

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]}>
      <View style={styles.headerRow}>
        <View style={styles.iconBadge}>
          <Ionicons name="link-outline" size={20} color={theme.accentEnd} />
        </View>
        <Text style={styles.title}>Family Command Center</Text>
      </View>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>
          Lets Hearth discover devices from your home's Family Command Center instead of typing IP addresses by hand.
          The address and token come from the command center's own Settings — ask whoever set it up if you don't have
          them.
        </Text>
      </View>

      <Text style={styles.label}>Address</Text>
      <TextInput
        style={styles.input}
        value={baseUrl}
        onChangeText={setBaseUrl}
        placeholder="http://192.168.1.172:3210"
        placeholderTextColor={theme.textTertiary}
        autoCapitalize="none"
        keyboardType="url"
      />

      <Text style={styles.label}>Token</Text>
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setToken}
        placeholder="Paste the shared token"
        placeholderTextColor={theme.textTertiary}
        autoCapitalize="none"
        secureTextEntry
      />

      {status === "error" && (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
          <Text style={styles.error}>{errorMessage}</Text>
        </View>
      )}

      <View style={styles.row}>
        <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={status === "checking"} />
        {/* Real-device finding (2026-09-10): CapabilityButton never shows both an icon and a
            visible label — this button rendered as a bare checkmark glyph with no visible "Save"
            / "Checking..." text at all. No icon here now. */}
        <CapabilityButton
          label={status === "checking" ? "Checking..." : "Save"}
          variant="accent"
          onPress={handleSave}
          disabled={!canSubmit}
        />
      </View>
      {status === "checking" && <ActivityIndicator color={theme.accentEnd} style={styles.spinner} />}
    </ScrollView>
  );
}
