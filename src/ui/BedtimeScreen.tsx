import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BedtimeWindow, describeClock } from "../core/kidMode/bedtimeWindow";
import { KidModePinModal } from "./KidModePinModal";
import { theme } from "./theme";
import { KidModeControls } from "./useKidMode";

interface BedtimeScreenProps {
  kid: KidModeControls;
  window: BedtimeWindow;
}

/** The calm screen kid mode shows during bedtime instead of any remote; a grown-up can still leave kid mode with the PIN. */
export function BedtimeScreen({ kid, window }: BedtimeScreenProps) {
  const insets = useSafeAreaInsets();
  const [askingPin, setAskingPin] = useState(false);
  return (
    <View style={[styles.container, { paddingTop: insets.top + theme.spacing.xxl, paddingBottom: insets.bottom + theme.spacing.xl }]}>
      <View style={styles.center}>
        <Ionicons name="moon-outline" size={56} color={theme.accentEnd} />
        <Text style={styles.title}>Bedtime</Text>
        <Text style={styles.body}>{`The remotes are resting. They wake up at ${describeClock(window.endMinutes)}.`}</Text>
      </View>
      <Pressable style={styles.adultLink} onPress={() => setAskingPin(true)} accessibilityRole="button" accessibilityLabel="Grown-up: leave kid mode">
        <Text style={styles.adultLabel}>Grown-up? Leave kid mode</Text>
      </Pressable>
      <KidModePinModal
        visible={askingPin}
        mode="verify"
        vault={kid.vault}
        onCancel={() => setAskingPin(false)}
        onSuccess={() => {
          setAskingPin(false);
          kid.disable();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background, paddingHorizontal: theme.spacing.xl },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md },
  title: { color: theme.textPrimary, fontSize: theme.type.display, fontWeight: "700" },
  body: { color: theme.textSecondary, fontSize: theme.type.subtitle, textAlign: "center", lineHeight: 24 },
  adultLink: { alignSelf: "center", paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  adultLabel: { color: theme.textTertiary, fontSize: theme.type.label },
});
