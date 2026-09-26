import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

const ICON_SIZE = 40;

interface FirstRunSetupCardProps {
  /** Whether a home server is already saved on this phone. */
  serverSaved: boolean;
  onJoinWithCode: () => void;
  onScanQr: () => void;
}

/** Empty-Devices card: asks a brand-new phone to connect to the home first, otherwise nudges toward adding a device (ADR-HEARTH-149). */
export function FirstRunSetupCard({ serverSaved, onJoinWithCode, onScanQr }: FirstRunSetupCardProps) {
  if (serverSaved) {
    return (
      <View style={styles.card}>
        <Ionicons name="home-outline" size={ICON_SIZE} color={theme.textTertiary} />
        <Text style={styles.title}>No devices yet</Text>
        <Text style={styles.body}>Scan your network or add your first TV or streaming device below to start controlling it.</Text>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <Ionicons name="home-outline" size={ICON_SIZE} color={theme.textTertiary} />
      <Text style={styles.title}>Connect to your home</Text>
      <Text style={styles.body}>Join your household's server to see and control your devices. No typing of long tokens needed.</Text>
      <View style={styles.buttons}>
        <CapabilityButton label="Join with a code" variant="accent" onPress={onJoinWithCode} />
        <CapabilityButton label="Scan QR" variant="ghost" onPress={onScanQr} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xxl,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    marginBottom: theme.spacing.lg,
  },
  title: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "600" },
  body: { color: theme.textSecondary, fontSize: theme.type.label, textAlign: "center", paddingHorizontal: theme.spacing.xl },
  buttons: { flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.md },
});
