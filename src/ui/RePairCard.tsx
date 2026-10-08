import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatCountdown } from "../discovery/pairingSession";
import { CapabilityButton } from "./CapabilityButton";
import { RemoteScaled, useRemoteScaled } from "./RemoteScaleContext";
import { RePairControls } from "./useRePair";
import { theme } from "./theme";

// ADR-HEARTH-223: the remote screen's "this TV stopped accepting Hearth's saved pairing" card, in
// four views (offer, waiting, failed, connected). It scales with the rest of the remote like
// ReconnectCard does (ADR-HEARTH-219), so showing it never pushes the screen into scrolling. The
// time-boxed waiting step reuses the shared pairing session (ADR-HEARTH-155).

const BAR_HEIGHT = 5;
const CHECK_ICON_SIZE = 22;

function Heading({ text, color, scaled }: { text: string; color?: string; scaled: RemoteScaled }) {
  return (
    <Text accessibilityRole="header" style={[styles.heading, { fontSize: scaled.font(theme.type.body) }, color ? { color } : null]}>
      {text}
    </Text>
  );
}

function Body({ text, scaled }: { text: string; scaled: RemoteScaled }) {
  return <Text style={[styles.body, { fontSize: scaled.font(theme.type.label) }]}>{text}</Text>;
}

function Buttons({ children, scaled }: { children: ReactNode; scaled: RemoteScaled }) {
  return <View style={[styles.buttons, { gap: scaled.size(theme.spacing.md) }]}>{children}</View>;
}

function Countdown({ remainingMs, totalMs, scaled }: { remainingMs: number; totalMs: number; scaled: RemoteScaled }) {
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  const barHeight = Math.max(2, scaled.size(BAR_HEIGHT));
  return (
    <View style={{ gap: scaled.size(theme.spacing.xs) }}>
      <Text style={[styles.countdown, { fontSize: scaled.font(theme.type.label) }]} accessibilityRole="timer" accessibilityLabel={`${Math.ceil(remainingMs / 1000)} seconds left`}>
        {formatCountdown(remainingMs)} left
      </Text>
      <View style={[styles.track, { height: barHeight, borderRadius: barHeight / 2 }]}>
        <View style={[styles.fill, { width: `${fraction * 100}%`, height: barHeight }]} />
      </View>
    </View>
  );
}

function OfferView({ controls, scaled }: { controls: RePairControls; scaled: RemoteScaled }) {
  if (!controls.offer) return null;
  return (
    <>
      <Heading text={controls.offer.title} scaled={scaled} />
      <Body text={controls.offer.body} scaled={scaled} />
      <Buttons scaled={scaled}>
        <CapabilityButton label={controls.offer.actionLabel} variant="accent" onPress={controls.start} />
      </Buttons>
    </>
  );
}

function WaitingView({ controls, scaled }: { controls: RePairControls; scaled: RemoteScaled }) {
  const state = controls.session;
  if (state.phase !== "waiting" || !controls.prompt) return null;
  return (
    <>
      <Heading text={controls.prompt.heading} scaled={scaled} />
      <Body text={controls.prompt.instruction} scaled={scaled} />
      {state.totalMs !== null && <Countdown remainingMs={state.remainingMs} totalMs={state.totalMs} scaled={scaled} />}
      <Buttons scaled={scaled}>
        <CapabilityButton label="Cancel" variant="ghost" onPress={controls.cancel} />
      </Buttons>
    </>
  );
}

function FailedView({ controls, scaled }: { controls: RePairControls; scaled: RemoteScaled }) {
  if (!controls.failure) return null;
  return (
    <>
      <Heading text={controls.failure.title} color={theme.statusError} scaled={scaled} />
      <Body text={controls.failure.message} scaled={scaled} />
      <Buttons scaled={scaled}>
        <CapabilityButton label="Cancel" variant="ghost" onPress={controls.cancel} />
        <CapabilityButton label="Try again" variant="accent" onPress={controls.retry} />
      </Buttons>
    </>
  );
}

function ConnectedView({ scaled }: { scaled: RemoteScaled }) {
  return (
    <View style={[styles.connectedRow, { gap: scaled.size(theme.spacing.sm) }]} accessibilityLabel="Connected">
      <Ionicons name="checkmark-circle" size={scaled.size(CHECK_ICON_SIZE)} color={theme.statusOn} />
      <Text style={[styles.connected, { fontSize: scaled.font(theme.type.body) }]}>Connected!</Text>
    </View>
  );
}

/** The re-pair card for the remote screen; renders nothing while the controls say the view is hidden. */
export function RePairCard({ controls }: { controls: RePairControls }) {
  const scaled = useRemoteScaled();
  if (controls.view === "hidden") return null;
  return (
    <View
      style={[
        styles.card,
        { gap: scaled.size(theme.spacing.sm), padding: scaled.size(theme.spacing.lg), borderRadius: scaled.size(theme.radius.lg) },
        controls.view === "connected" && styles.cardConnected,
      ]}
      accessibilityLiveRegion="polite"
    >
      {controls.view === "offer" && <OfferView controls={controls} scaled={scaled} />}
      {controls.view === "waiting" && <WaitingView controls={controls} scaled={scaled} />}
      {controls.view === "failed" && <FailedView controls={controls} scaled={scaled} />}
      {controls.view === "connected" && <ConnectedView scaled={scaled} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.statusErrorSoft,
    borderWidth: 1,
    borderColor: theme.statusError,
  },
  cardConnected: { backgroundColor: theme.surface, borderColor: theme.statusOn },
  heading: { color: theme.textPrimary, fontWeight: "700" },
  body: { color: theme.textSecondary },
  buttons: { flexDirection: "row", justifyContent: "flex-end" },
  countdown: { color: theme.textPrimary, fontWeight: "600" },
  track: { backgroundColor: theme.border, overflow: "hidden" },
  fill: { backgroundColor: theme.accentEnd },
  connectedRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  connected: { color: theme.statusOn, fontWeight: "700" },
});
