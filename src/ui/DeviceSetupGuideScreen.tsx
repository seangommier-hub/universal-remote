import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CapabilityButton } from "./CapabilityButton";
import { DeviceSetupGuide } from "./deviceSetupSteps";
import { theme } from "./theme";

interface DeviceSetupGuideScreenProps {
  guide: DeviceSetupGuide;
  onDone: () => void;
}

/**
 * Full-screen, numbered walkthrough for the real steps a brand's Add flow needs done on the
 * device itself (Sean, 2026-09-13: "bring you to the page to do so"). Reached via a "Setup This
 * Device" button on the relevant Add*DeviceScreen and dismissed back to it — this screen never
 * touches the IP/PSK fields itself, it only explains what to go do before/while filling them in.
 */
export function DeviceSetupGuideScreen({ guide, onDone }: DeviceSetupGuideScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]}>
        <Text style={styles.title}>{guide.title}</Text>
        {guide.steps.map((step, index) => (
          <View key={index} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <CapabilityButton label="Done" variant="accent" icon="checkmark" onPress={onDone} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { padding: theme.spacing.xl, gap: theme.spacing.lg },
  title: { color: theme.textPrimary, fontSize: theme.type.title, fontWeight: "700", marginBottom: theme.spacing.sm },
  stepRow: { flexDirection: "row", gap: theme.spacing.md, alignItems: "flex-start" },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: theme.radius.full,
    backgroundColor: theme.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  stepNumberText: { color: theme.accentEnd, fontSize: theme.type.label, fontWeight: "700" },
  stepText: { flex: 1, color: theme.textPrimary, fontSize: theme.type.body, lineHeight: 22 },
  footer: { padding: theme.spacing.xl, borderTopWidth: 1, borderTopColor: theme.borderSubtle },
});
