import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Share, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HouseholdRole, loadFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import {
  fetchHouseholdPhones,
  fetchOwnIdentity,
  HouseholdPhone,
  HouseholdPhonesError,
  renameHouseholdPhone,
  revokeHouseholdPhone,
  setHouseholdPhoneRole,
} from "../discovery/householdPhones";
import { createPairInvite } from "../discovery/pairClient";
import { buildPairLink } from "../discovery/pairInvite";
import { formatCountdown, secondsUntilExpiry } from "../discovery/inviteCountdown";
import { CapabilityButton } from "./CapabilityButton";
import { addDeviceFormStyles as formStyles } from "./addDeviceFormStyles";
import { theme } from "./theme";

const ROLES: readonly HouseholdRole[] = ["owner", "adult", "guest"];
const ROLE_LABEL: Record<HouseholdRole, string> = { owner: "Owner", adult: "Adult", guest: "Guest" };
const DEFAULT_GUEST_HOURS = "6";
const TICK_MS = 1000;

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
  if (error instanceof HouseholdPhonesError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

const NO_PERSONAL_PHONES_TEXT = "No phone has its own pairing yet. Phones still using the shared household token show up here once they re-pair (Re-pair on the Devices tab).";

interface HouseholdPhonesScreenProps {
  onDone: () => void;
}

/**
 * Owner-only settings screen (ADR-HEARTH-189, phase 2): every phone paired to this household, with
 * its role and last-used time; an owner can rename, change the role of, or revoke any OTHER phone,
 * and invite a new time-limited guest. Reachable only when this phone's own role is "owner" — the
 * caller (FamilyCommandCenterSettingsScreen) already checks that before showing the entry point,
 * and every mutating call here is independently enforced owner-only by the Pi regardless.
 */
export function HouseholdPhonesScreen({ onDone }: HouseholdPhonesScreenProps) {
  const insets = useSafeAreaInsets();
  const [phones, setPhones] = useState<HouseholdPhone[] | null>(null);
  const [ownId, setOwnId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [guestHours, setGuestHours] = useState(DEFAULT_GUEST_HOURS);
  const [guestInvite, setGuestInvite] = useState<{ code: string; publicBaseUrl: string | null; baseUrl: string; expiresAt: string } | null>(null);
  const [guestBusy, setGuestBusy] = useState(false);
  const [guestError, setGuestError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [identity, list] = await Promise.all([fetchOwnIdentity(), fetchHouseholdPhones()]);
      setOwnId(identity.id);
      setPhones(list);
    } catch (error) {
      setLoadError(describeAdminError(error));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!guestInvite) return;
    const tick = () => setSecondsLeft(secondsUntilExpiry(guestInvite.expiresAt, Date.now()));
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [guestInvite]);

  async function handleRoleChange(phone: HouseholdPhone, role: HouseholdRole) {
    if (role === phone.role) return;
    setRowError(null);
    try {
      await setHouseholdPhoneRole(phone.id, role);
      await load();
    } catch (error) {
      setRowError({ id: phone.id, message: describeAdminError(error) });
    }
  }

  async function handleRevoke(phone: HouseholdPhone) {
    setRowError(null);
    try {
      await revokeHouseholdPhone(phone.id);
      await load();
    } catch (error) {
      setRowError({ id: phone.id, message: describeAdminError(error) });
    }
  }

  function startRename(phone: HouseholdPhone) {
    setRenamingId(phone.id);
    setRenameDraft(phone.phoneName);
  }

  async function commitRename(phone: HouseholdPhone) {
    const name = renameDraft.trim();
    setRenamingId(null);
    if (!name || name === phone.phoneName) return;
    setRowError(null);
    try {
      await renameHouseholdPhone(phone.id, name);
      await load();
    } catch (error) {
      setRowError({ id: phone.id, message: describeAdminError(error) });
    }
  }

  async function handleCreateGuestInvite() {
    const hours = Math.round(Number(guestHours));
    if (!Number.isFinite(hours) || hours < 1) {
      setGuestError("Enter a whole number of hours, at least 1.");
      return;
    }
    setGuestBusy(true);
    setGuestError("");
    try {
      const config = await loadFamilyCommandCenterConfig();
      if (!config) throw new Error("Family Command Center isn't connected.");
      const invite = await createPairInvite(config.baseUrl, config.token, hours);
      setGuestInvite(invite);
    } catch (error) {
      setGuestInvite(null);
      setGuestError(describeAdminError(error));
    } finally {
      setGuestBusy(false);
    }
  }

  function shareGuestInvite() {
    if (!guestInvite) return;
    const link = buildPairLink(guestInvite.code, guestInvite.publicBaseUrl ?? guestInvite.baseUrl);
    Share.share({ message: `Join our home on Hearth as a guest, code ${guestInvite.code}: ${link}` });
  }

  const guestExpired = guestInvite !== null && secondsLeft <= 0;

  return (
    <ScrollView style={formStyles.container} contentContainerStyle={[formStyles.content, { paddingTop: insets.top + theme.spacing.lg }]}>
      <View style={formStyles.headerRow}>
        <View style={formStyles.iconBadge}>
          <Ionicons name="people-outline" size={20} color={theme.accentEnd} />
        </View>
        <Text style={formStyles.title}>Household phones</Text>
      </View>
      <View style={formStyles.hintCard}>
        <Text style={formStyles.hint}>Every phone paired to this household. Only an owner can rename, change roles, revoke a phone, or invite a guest.</Text>
      </View>

      {loadError !== "" && (
        <View style={formStyles.errorCard}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
          <Text style={formStyles.error}>{loadError}</Text>
        </View>
      )}
      {phones === null && loadError === "" && <ActivityIndicator color={theme.accentEnd} style={styles.spinner} />}

      {/* ADR-HEARTH-208: an empty list read as broken. Phones still on the shared household token (every
          phone before ADR-HEARTH-181 re-pairing) have no per-phone record, so they are not listed. */}
      {phones !== null && phones.length === 0 && loadError === "" && <Text style={styles.meta}>{NO_PERSONAL_PHONES_TEXT}</Text>}
      {phones !== null &&
        phones.map((phone, index) => (
          <View key={phone.id} style={[styles.row, index === phones.length - 1 && styles.lastRow]}>
            {renamingId === phone.id ? (
              <TextInput
                style={formStyles.input}
                value={renameDraft}
                onChangeText={setRenameDraft}
                onBlur={() => commitRename(phone)}
                autoFocus
                placeholder="Phone name"
                placeholderTextColor={theme.textTertiary}
              />
            ) : (
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {phone.phoneName}
                  {phone.id === ownId ? " (this phone)" : ""}
                </Text>
                <CapabilityButton label="Rename" icon="pencil-outline" variant="ghost" onPress={() => startRename(phone)} />
              </View>
            )}
            <Text style={styles.meta}>
              {relativeLastUsed(phone.lastUsedAt)}
              {phone.revoked ? " · Revoked" : ""}
              {phone.role === "guest" && phone.guestExpiresAt ? ` · Guest until ${new Date(phone.guestExpiresAt).toLocaleString()}` : ""}
            </Text>
            <View style={styles.roleRow}>
              {ROLES.map((role) => (
                <CapabilityButton key={role} label={ROLE_LABEL[role]} variant={role === phone.role ? "accent" : "ghost"} onPress={() => handleRoleChange(phone, role)} />
              ))}
            </View>
            {!phone.revoked && <CapabilityButton label="Revoke" icon="close-circle-outline" variant="ghost" onPress={() => handleRevoke(phone)} />}
            {rowError?.id === phone.id && <Text style={styles.rowError}>{rowError.message}</Text>}
          </View>
        ))}

      <View style={styles.divider} />
      <Text style={formStyles.title}>Invite a guest</Text>
      <View style={formStyles.hintCard}>
        <Text style={formStyles.hint}>
          A guest (e.g. a babysitter) sees only the devices you've allowed for guests, and stops working on its own after the hours you choose.
        </Text>
      </View>
      {guestInvite && !guestExpired ? (
        <>
          <Text style={styles.code} selectable>
            {guestInvite.code}
          </Text>
          <Text style={styles.meta}>Expires in {formatCountdown(secondsLeft)} - works once</Text>
          <CapabilityButton label="Share guest invite" variant="accent" onPress={shareGuestInvite} />
        </>
      ) : (
        <>
          {guestExpired && <Text style={styles.meta}>That code expired.</Text>}
          <Text style={formStyles.label}>Hours until it stops working</Text>
          <TextInput
            style={formStyles.input}
            value={guestHours}
            onChangeText={setGuestHours}
            keyboardType="number-pad"
            placeholder={DEFAULT_GUEST_HOURS}
            placeholderTextColor={theme.textTertiary}
          />
          {guestError !== "" && <Text style={formStyles.error}>{guestError}</Text>}
          <CapabilityButton label={guestBusy ? "Creating..." : "Create guest invite"} variant="accent" onPress={handleCreateGuestInvite} disabled={guestBusy} />
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
  // ADR-HEARTH-208: same double-line fix as HouseholdRemotesScreen.
  lastRow: { borderBottomWidth: 0 },
  roleRow: { flexDirection: "row", gap: theme.spacing.xs, flexWrap: "wrap" },
  rowError: { color: theme.statusError, fontSize: theme.type.label },
  divider: { height: 1, backgroundColor: theme.borderSubtle, marginVertical: theme.spacing.lg },
  code: { color: theme.accentEnd, fontSize: 40, fontWeight: "800", letterSpacing: 6, textAlign: "center" },
});
