import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { BrandEntry, brandsForAddress } from "../discovery/brandRegistry";
import { DiscoveryRow } from "../discovery/discoveryRows";
import { theme } from "./theme";

const MIN_TARGET = 44;
const ICON_SIZE = 18;
const BACKDROP_COLOR = "#00000099";

interface BrandPickerModalProps {
  /** The device being labeled; null hides the modal. */
  row: DiscoveryRow | null;
  onPick: (brand: BrandEntry) => void;
  onCancel: () => void;
}

/** Short "what is this device?" list, best vendor guess first; picking one remembers the answer for this device. */
export function BrandPickerModal({ row, onPick, onCancel }: BrandPickerModalProps) {
  const brands = row ? brandsForAddress(row.device.hostname, row.device.vendor) : [];
  return (
    <Modal visible={row !== null} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Close brand list">
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title} numberOfLines={2}>
            What is {row?.title}?
          </Text>
          <Text style={styles.body}>Pick the brand. Its address ({row?.device.ip}) carries over.</Text>
          <ScrollView style={styles.list}>
            {brands.map((brand) => (
              <Pressable
                key={brand.id}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                onPress={() => onPick(brand)}
                accessibilityRole="button"
                accessibilityLabel={`It's a ${brand.label}`}
              >
                <Ionicons name={brand.icon} size={ICON_SIZE} color={theme.accentEnd} />
                <Text style={styles.optionLabel}>{brand.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.cancel} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: BACKDROP_COLOR, alignItems: "center", justifyContent: "center", padding: theme.spacing.xl },
  card: { width: "100%", maxWidth: 360, maxHeight: "80%", backgroundColor: theme.surfaceRaised, borderRadius: theme.radius.lg, padding: theme.spacing.lg, gap: theme.spacing.sm },
  title: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700" },
  body: { color: theme.textSecondary, fontSize: theme.type.label },
  list: { flexGrow: 0 },
  option: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, minHeight: MIN_TARGET, borderRadius: theme.radius.sm },
  optionPressed: { backgroundColor: theme.surface },
  optionLabel: { color: theme.accentEnd, fontSize: theme.type.body, fontWeight: "600" },
  cancel: { minHeight: MIN_TARGET, alignItems: "center", justifyContent: "center", borderTopWidth: 1, borderTopColor: theme.border },
  cancelLabel: { color: theme.textSecondary, fontSize: theme.type.body, fontWeight: "600", textAlign: "center" },
});
