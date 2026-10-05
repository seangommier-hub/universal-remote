import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Share, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createRemotePairingCode, fetchHouseholdRemotes, HouseholdRemote, HouseholdRemotesError, renameHouseholdRemote, revokeHouseholdRemote } from "../discovery/householdRemotes";
import { formatCountdown, secondsUntilExpiry } from "../discovery/inviteCountdown";
import { CapabilityButton } from "./CapabilityButton";
import { RemoteSettingsPinPanel } from "./RemoteSettingsPinPanel";
import { addDeviceFormStyles as formStyles } from "./addDeviceFormStyles";
import { theme } from "./theme";

const TICK_MS = 1000;

/** Groups a pairing code into 3-digit chunks ("123 456") for readability — purely cosmetic, the
 * raw code (no spaces) is what the physical remote's keypad ever produces, so grouping here never
 * has to be undone anywhere it's typed back in. Any length not evenly divisible by 3 (e.g. an
 * older 8-character code) is shown ungrouped rather than breaking mid-character. */
function formatPairingCode(code: string): string {
  if (code.length % 3 !== 0) return code;
  return code.match(/.{1,3}/g)?.join(" ") ?? code;
}

function relativeLastUsed(lastUsedAt: string | null): string {
  if (!lastUsedAt) return "Never used";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(lastUsedAt)) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Friendly copy for whatever the admin routes refuse; falls back to the error's own message. */
function describeAdminError(error: unknown): string {
  if (error instanceof HouseholdRemotesError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

interface HouseholdRemotesScreenProps {
  onDone: () => void;
  /** Opens the per-remote button-mapping picker (EditRemoteButtonsScreen). */
  onEditButtons: (remote: HouseholdRemote) => void;
}

/**
 * Owner-only settings screen (ADR-HEARTH-201): every physical remote paired to this household,
 * with its last-used time; an owner can rename or revoke any remote, open its button-mapping
 * editor, and pair a new remote by generating a single-use code for it to redeem. Reachable only
 * when this phone's own role is "owner" — the caller (FamilyCommandCenterSettingsScreen) already
 * checks that before showing the entry point, and every mutating call here is independently
 * enforced owner-only by the Pi regardless. Mirrors HouseholdPhonesScreen.tsx's shape.
 */
export function HouseholdRemotesScreen({ onDone, onEditButtons }: HouseholdRemotesScreenProps) {
  const insets = useSafeAreaInsets();
  const [remotes, setRemotes] = useState<HouseholdRemote[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingError, setPairingError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      setRemotes(await fetchHouseholdRemotes());
    } catch (error) {
      setLoadError(describeAdminError(error));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!pairing) return;
    const tick = () => setSecondsLeft(secondsUntilExpiry(pairing.expiresAt, Date.now()));
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [pairing]);

  async function handleRevoke(remote: HouseholdRemote) {
    setRowError(null);
    try {
      await revokeHouseholdRemote(remote.id);
      await load();
    } catch (error) {
      setRowError({ id: remote.id, message: describeAdminError(error) });
    }
  }

  function startRename(remote: HouseholdRemote) {
    setRenamingId(remote.id);
    setRenameDraft(remote.name);
  }

  async function commitRename(remote: HouseholdRemote) {
    const name = renameDraft.trim();
    setRenamingId(null);
    if (!name || name === remote.name) return;
    setRowError(null);
    try {
      await renameHouseholdRemote(remote.id, name);
      await load();
    } catch (error) {
      setRowError({ id: remote.id, message: describeAdminError(error) });
    }
  }

  async function handlePairRemote() {
    setPairingBusy(true);
    setPairingError("");
    try {
      setPairing(await createRemotePairingCode());
    } catch (error) {
      setPairing(null);
      setPairingError(describeAdminError(error));
    } finally {
      setPairingBusy(false);
    }
  }

  function sharePairingCode() {
    if (!pairing) return;
    Share.share({ message: `Pairing code for your Hearth physical remote: ${formatPairingCode(pairing.code)}` });
  }

  const pairingExpired = pairing !== null && secondsLeft <= 0;

  return (
    <ScrollView style={formStyles.container} contentContainerStyle={[formStyles.content, { paddingTop: insets.top + theme.spacing.lg }]}>
      <View style={formStyles.headerRow}>
        <View style={formStyles.iconBadge}>
          <Ionicons name="hardware-chip-outline" size={20} color={theme.accentEnd} />
        </View>
        <Text style={formStyles.title}>Household remotes</Text>
      </View>
      <View style={formStyles.hintCard}>
        <Text style={formStyles.hint}>Every physical remote paired to this household. Only an owner can rename, revoke, remap, or pair a new one.</Text>
      </View>

      {loadError !== "" && (
        <View style={formStyles.errorCard}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
          <Text style={formStyles.error}>{loadError}</Text>
        </View>
      )}
      {remotes === null && loadError === "" && <ActivityIndicator color={theme.accentEnd} style={styles.spinner} />}
      {remotes !== null && remotes.length === 0 && loadError === "" && <Text style={styles.meta}>No physical remotes paired yet.</Text>}

      {remotes !== null &&
        remotes.map((remote, index) => (
          <View key={remote.id} style={[styles.row, index === remotes.length - 1 && styles.lastRow]}>
            {renamingId === remote.id ? (
              <TextInput
                style={formStyles.input}
                value={renameDraft}
                onChangeText={setRenameDraft}
                onBlur={() => commitRename(remote)}
                autoFocus
                placeholder="Remote name"
                placeholderTextColor={theme.textTertiary}
              />
            ) : (
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {remote.name}
                </Text>
                <CapabilityButton label="Rename" icon="pencil-outline" variant="ghost" onPress={() => startRename(remote)} />
              </View>
            )}
            <Text style={styles.meta}>
              {relativeLastUsed(remote.lastUsedAt)}
              {remote.revoked ? " · Revoked" : ""}
            </Text>
            <View style={styles.roleRow}>
              {!remote.revoked && <CapabilityButton label="Edit buttons" icon="grid-outline" variant="ghost" onPress={() => onEditButtons(remote)} />}
              {!remote.revoked && <CapabilityButton label="Revoke" icon="close-circle-outline" variant="ghost" onPress={() => handleRevoke(remote)} />}
            </View>
            {rowError?.id === remote.id && <Text style={styles.rowError}>{rowError.message}</Text>}
          </View>
        ))}

      <View style={styles.divider} />
      {/* ADR-HEARTH-209: the PIN the physical remote asks for before its device settings open. */}
      <RemoteSettingsPinPanel />

      <View style={styles.divider} />
      <Text style={formStyles.title}>Pair a remote</Text>
      <View style={formStyles.hintCard}>
        <Text style={formStyles.hint}>Generates a single-use code, valid for a few minutes, for a new physical remote to redeem.</Text>
      </View>
      {pairing && !pairingExpired ? (
        <>
          <Text style={styles.code} selectable>
            {formatPairingCode(pairing.code)}
          </Text>
          <Text style={styles.meta}>Expires in {formatCountdown(secondsLeft)} · works once</Text>
          <CapabilityButton label="Share pairing code" variant="accent" onPress={sharePairingCode} />
        </>
      ) : (
        <>
          {pairingExpired && <Text style={styles.meta}>That code expired.</Text>}
          {pairingError !== "" && <Text style={formStyles.error}>{pairingError}</Text>}
          <CapabilityButton label={pairingBusy ? "Generating..." : "Generate pairing code"} variant="accent" onPress={handlePairRemote} disabled={pairingBusy} />
        </>
      )}

      <CapabilityButton label="Done" variant="ghost" onPress={onDone} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  spinner: { alignSelf: "flex-start", marginTop: theme.spacing.lg },
  row: {
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm },
  name: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "600", flexShrink: 1 },
  meta: { color: theme.textTertiary, fontSize: theme.type.label },
  // ADR-HEARTH-208: the last row border sat right above the section divider, drawing two lines.
  lastRow: { borderBottomWidth: 0 },
  roleRow: { flexDirection: "row", gap: theme.spacing.xs, flexWrap: "wrap" },
  rowError: { color: theme.statusError, fontSize: theme.type.label },
  divider: { height: 1, backgroundColor: theme.borderSubtle, marginVertical: theme.spacing.lg },
  code: { color: theme.accentEnd, fontSize: 40, fontWeight: "800", letterSpacing: 6, textAlign: "center" },
});
