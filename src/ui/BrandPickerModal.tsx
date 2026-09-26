import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { BrandEntry, brandsForAddress } from "../discovery/brandRegistry";
import { DiscoveryRow } from "../discovery/discoveryRows";
import { theme } from "./theme";

interface BrandPickerModalProps {
  /** The unidentified device being added; null hides the modal. */
  row: DiscoveryRow | null;
  onPick: (brand: BrandEntry) => void;
  onCancel: () => void;
}

/** Short "what is this device?" list, best vendor guess first, shown when identification still fails. */
export function BrandPickerModal({ row, onPick, onCancel }: BrandPickerModalProps) {
  const brands = row ? brandsForAddress(row.device.hostname, row.device.vendor) : [];
  return (
    <Modal visible={row !== null} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>What is {row?.title}?</Text>
          <Text style={styles.body}>Pick the brand — its address ({row?.device.ip}) carries over.</Text>
          <ScrollView style={styles.list}>
            {brands.map((brand) => (
              <Pressable key={brand.id} style={({ pressed }) => [styles.option, pressed && styles.optionPressed]} onPress={() => onPick(brand)}>
                <Ionicons name={brand.icon} size={18} color={theme.accentEnd} />
                <Text style={styles.optionLabel}>{brand.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.cancel} onPress={onCancel}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#00000099", alignItems: "center", justifyContent: "center", padding: theme.spacing.xl },
  card: { width: "100%", maxWidth: 360, maxHeight: "80%", backgroundColor: theme.surfaceRaised, borderRadius: theme.radius.lg, padding: theme.spacing.lg, gap: theme.spacing.sm },
  title: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700" },
  body: { color: theme.textSecondary, fontSize: theme.type.label },
  list: { flexGrow: 0 },
  option: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingVertical: theme.spacing.md, borderRadius: theme.radius.sm },
  optionPressed: { backgroundColor: theme.surface },
  optionLabel: { color: theme.accentEnd, fontSize: theme.type.body, fontWeight: "600" },
  cancel: { paddingVertical: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.border },
  cancelLabel: { color: theme.textSecondary, fontSize: theme.type.body, fontWeight: "600", textAlign: "center" },
});
