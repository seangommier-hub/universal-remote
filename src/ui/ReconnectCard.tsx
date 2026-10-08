import { StyleSheet, Text, View } from "react-native";
import { CapabilityButton } from "./CapabilityButton";
import { describeReconnectFailure } from "./describeReconnectFailure";
import { useRemoteScaled } from "./RemoteScaleContext";
import { theme } from "./theme";

interface ReconnectCardProps {
  reconnecting: boolean;
  reconnectError: string;
  onTryNow: () => void;
}

/**
 * Real-hardware/UX research (2026-09-17): "this should act like a normal remote
 * would... persist and not timeout, it should be on demand for the user." The
 * underlying behavior was already right — every driver retries forever in the
 * background whenever disconnected (ADR-HEARTH-017), and the remote screen already
 * auto-attempts on open — but the copy here read as a dead end ("Not connected,"
 * controls simply "disabled") rather than communicating the ongoing automatic effort
 * that's actually happening the entire time this card is showing. A real error is
 * still shown when there is one (never hidden), just framed as the last attempt's
 * outcome rather than a final, stuck state — background retry continues regardless of
 * whether this specific manual tap succeeded.
 */
export function ReconnectCard({ reconnecting, reconnectError, onTryNow }: ReconnectCardProps) {
  const { size, font } = useRemoteScaled();
  const labelFont = { fontSize: font(theme.type.label) };
  return (
    <View style={[styles.reconnectCard, { gap: size(theme.spacing.md), padding: size(theme.spacing.lg), borderRadius: size(theme.radius.lg) }]}>
      <View style={[styles.reconnectTextGroup, { gap: size(theme.spacing.xs) }]}>
        <Text style={[styles.reconnectTitle, { fontSize: font(theme.type.body) }]}>Reconnecting…</Text>
        {reconnectError ? (
          <Text style={[styles.reconnectError, labelFont]}>{describeReconnectFailure(reconnectError)}</Text>
        ) : (
          <Text style={[styles.reconnectBody, labelFont]}>Controls are off for now — retrying automatically in the background. Tap to try right now.</Text>
        )}
      </View>
      {/* Real-device finding (2026-09-10), same bug as the Input buttons: CapabilityButton
          never shows both an icon and visible label together, so this button — reconnecting or
          not — was rendering as a bare refresh glyph with no visible text at all. No icon here now. */}
      <CapabilityButton label={reconnecting ? "Trying…" : "Try Now"} variant="accent" onPress={onTryNow} disabled={reconnecting} />
    </View>
  );
}

const styles = StyleSheet.create({
  reconnectCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    backgroundColor: theme.statusErrorSoft,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.statusError,
    padding: theme.spacing.lg,
  },
  reconnectTextGroup: { flex: 1, gap: theme.spacing.xs },
  reconnectTitle: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "700" },
  reconnectBody: { color: theme.textSecondary, fontSize: theme.type.label },
  reconnectError: { color: theme.statusError, fontSize: theme.type.label },
});
