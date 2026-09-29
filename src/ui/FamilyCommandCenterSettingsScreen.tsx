import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { classifyNetworkFailure, NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { logger } from "../core/logging/logger";
import { NetworkFailureNotice } from "./NetworkFailureNotice";
import { loadFamilyCommandCenterConfig, verifyAndSaveFamilyCommandCenterConfig, verifyAndSavePublicUrl } from "../discovery/familyCommandCenterConfig";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { Device } from "../core/types/Device";
import { CapabilityButton } from "./CapabilityButton";
import { DeviceSharePanel } from "./DeviceSharePanel";
import { InviteSomeonePanel } from "./InviteSomeonePanel";
import { PhoneNameField } from "./PhoneNameField";
import { KidModeSettingsPanel } from "./KidModeSettingsPanel";
import { RecentActivityList } from "./RecentActivityList";
import type { KidModeControls } from "./useKidMode";
import { theme } from "./theme";
import { refreshOwnRole } from "../discovery/householdPhones";

const LOG_SCOPE = "FamilyCommandCenterSettingsScreen";

interface FamilyCommandCenterSettingsScreenProps {
  onCancel: () => void;
  onSaved: () => void;
  onJoinWithCode: () => void;
  kid: KidModeControls;
  /** Called after kid mode is switched on. */
  onKidModeOn: () => void;
  onOpenPrivacy: () => void;
  /** ADR-HEARTH-189 (phase 2): opens the "Household phones" admin screen. Only ever shown when
   * this phone's own role is "owner" -- a kid-mode or guest phone never sees this screen. */
  onOpenHouseholdPhones: () => void;
  /** ADR-HEARTH-201: opens the "Household remotes" admin screen (pair/rename/revoke a physical
   * remote, edit its button map). Same owner-only gating as onOpenHouseholdPhones. */
  onOpenHouseholdRemotes: () => void;
  devices: Device[];
  onDeviceAdded: (device: Device) => Device;
  onDeviceUpdated: (device: Device) => void;
}

/**
 * One-time setup for the Family Command Center discovery integration
 * (ADR-HEARTH-010): the household's own base URL and the shared bearer
 * token it issued. Verifies the connection actually works (a real
 * unauthenticated GET would 401/503) before saving, rather than accepting
 * whatever was typed and failing silently the next time Discover runs.
 */
export function FamilyCommandCenterSettingsScreen({ onCancel, onSaved, onJoinWithCode, kid, onKidModeOn, onOpenPrivacy, onOpenHouseholdPhones, onOpenHouseholdRemotes, devices, onDeviceAdded, onDeviceUpdated }: FamilyCommandCenterSettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [alreadyConnected, setAlreadyConnected] = useState(false);
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [failure, setFailure] = useState<NetworkFailureDiagnosis | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    // Real gap found live (2026-09-28, ADR-HEARTH-196): loadFamilyCommandCenterConfig() reads
    // SecureStore (see familyCommandCenterConfig.ts) and rejects if that read throws -- a real
    // failure mode this exact household hit the same day, for a different SecureStore read, as
    // "KeyChainException: User interaction is not allowed" (a brief backgrounded/locked-phone
    // Keychain access denial). Without a `.catch()` this was an unhandled promise rejection on
    // the screen the settings gear opens -- the form was then stuck never learning it's already
    // connected, on the one screen this whole app treats as the "settings" entry point. Same
    // fallback the codebase already uses for this exact call in useNetworkDevices.ts.
    loadFamilyCommandCenterConfig()
      .then((existing) => {
        if (existing) {
          setAlreadyConnected(true);
          setBaseUrl(existing.baseUrl);
          setToken(existing.token);
          setPublicBaseUrl(existing.publicBaseUrl ?? "");
          setIsOwner(existing.role === "owner");
          // Refreshes in the background (never blocks the form from showing); a stale cached role
          // only means the "Household phones" entry point briefly lags a real promotion/demotion.
          refreshOwnRole().then((role) => {
            if (role !== null) setIsOwner(role === "owner");
          });
        }
      })
      .catch((error) => logger.warn(LOG_SCOPE, "could not read the saved Family Command Center config", { error: String(error) }));
  }, []);

  async function handleSave() {
    setStatus("checking");
    setErrorMessage("");
    setFailure(null);
    try {
      await verifyAndSaveFamilyCommandCenterConfig(baseUrl, token);
      // Real ask (2026-09-21, ADR-HEARTH-123): "this should be something that can still be used
      // even when off network." Optional, separate verification — an empty field here just clears
      // a previously-saved public URL rather than failing the whole save.
      await verifyAndSavePublicUrl(publicBaseUrl);
      onSaved();
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setFailure(classifyNetworkFailure(err));
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
        placeholder="http://192.168.x.x:3210"
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

      <Text style={styles.label}>Public address (optional)</Text>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>
          Lets Hearth reach your devices even when your phone isn't on the home WiFi — leave this blank if you only
          ever use Hearth at home. Same token as above.
        </Text>
      </View>
      <TextInput
        style={styles.input}
        value={publicBaseUrl}
        onChangeText={setPublicBaseUrl}
        placeholder="https://hearth-relay.carddna.app"
        placeholderTextColor={theme.textTertiary}
        autoCapitalize="none"
        keyboardType="url"
      />

      {status === "error" && failure && failure.kind !== "unknown" && <NetworkFailureNotice diagnosis={failure} />}
      {status === "error" && (!failure || failure.kind === "unknown") && (
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

      <CapabilityButton label="Join with a code instead" variant="ghost" onPress={onJoinWithCode} disabled={status === "checking"} />
      <CapabilityButton label="What leaves your house" icon="eye-outline" variant="ghost" onPress={onOpenPrivacy} disabled={status === "checking"} />
      {alreadyConnected && <InviteSomeonePanel />}
      {alreadyConnected && isOwner && (
        <CapabilityButton label="Household phones" icon="people-outline" variant="ghost" onPress={onOpenHouseholdPhones} disabled={status === "checking"} />
      )}
      {alreadyConnected && isOwner && (
        <CapabilityButton label="Household remotes" icon="hardware-chip-outline" variant="ghost" onPress={onOpenHouseholdRemotes} disabled={status === "checking"} />
      )}
      <PhoneNameField />
      <KidModeSettingsPanel kid={kid} onKidModeOn={onKidModeOn} />
      {alreadyConnected && <RecentActivityList />}

      <DeviceSharePanel devices={devices} onDeviceAdded={onDeviceAdded} onDeviceUpdated={onDeviceUpdated} />

    </ScrollView>
  );
}
