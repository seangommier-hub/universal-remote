import { useEffect, useState } from "react";
import { ActivityIndicator, Share, StyleSheet, Text, View } from "react-native";
import { loadFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import { formatCountdown, secondsUntilExpiry } from "../discovery/inviteCountdown";
import { createPairInvite, CreatedInvite } from "../discovery/pairClient";
import { buildPairLink } from "../discovery/pairInvite";
import { CapabilityButton } from "./CapabilityButton";
import { describePairFailure } from "./describePairFailure";
import { theme } from "./theme";

const TICK_MS = 1000;
const NOT_CONNECTED_MESSAGE = "Connect this phone to Family Command Center first.";

/** Creates a short-lived invite code on the server and shows it large with a countdown and a Share button (ADR-HEARTH-149). */
export function InviteSomeonePanel() {
  const [invite, setInvite] = useState<CreatedInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!invite) return;
    const tick = () => setSecondsLeft(secondsUntilExpiry(invite.expiresAt, Date.now()));
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [invite]);

  async function handleCreate() {
    setBusy(true);
    setError("");
    try {
      const config = await loadFamilyCommandCenterConfig();
      if (!config) throw new Error(NOT_CONNECTED_MESSAGE);
      setInvite(await createPairInvite(config.baseUrl, config.token));
    } catch (err) {
      setInvite(null);
      const notice = describePairFailure(err);
      setError(notice.message ?? notice.diagnosis?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  function handleShare() {
    if (!invite) return;
    const link = buildPairLink(invite.code, invite.publicBaseUrl ?? invite.baseUrl);
    Share.share({ message: `Join our home on Hearth with code ${invite.code}: ${link}` });
  }

  const expired = invite !== null && secondsLeft <= 0;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Invite someone</Text>
      {invite && !expired && (
        <>
          <Text style={styles.code} selectable>{invite.code}</Text>
          <Text style={styles.countdown}>Expires in {formatCountdown(secondsLeft)} - works once</Text>
          <CapabilityButton label="Share invite" variant="accent" onPress={handleShare} />
        </>
      )}
      {expired && <Text style={styles.countdown}>That code expired.</Text>}
      {error.length > 0 && <Text style={styles.error}>{error}</Text>}
      <CapabilityButton label={invite && !expired ? "New code" : "Create invite code"} variant="ghost" onPress={handleCreate} disabled={busy} />
      {busy && <ActivityIndicator color={theme.accentEnd} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    alignItems: "center",
    marginTop: theme.spacing.lg,
  },
  title: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "600" },
  code: { color: theme.accentEnd, fontSize: 40, fontWeight: "800", letterSpacing: 6 },
  countdown: { color: theme.textSecondary, fontSize: theme.type.label },
  error: { color: theme.statusError, fontSize: theme.type.label, textAlign: "center" },
});
