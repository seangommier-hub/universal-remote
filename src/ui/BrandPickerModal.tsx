import { Modal, Pressable, StyleSheet, Text } from "react-native";
import { BrandEntry, brandsForAddress } from "../discovery/brandRegistry";
import { DiscoveryRow } from "../discovery/discoveryRows";
import { BrandOptionList } from "./BrandOptionList";
import { theme } from "./theme";

const MIN_TARGET = 44;
const SEARCH_AFTER = 6;
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
      {/* accessible={false} on both wrapping Pressables (ADR-HEARTH-180): a Pressable defaults to
          accessible=true, which collapses every descendant into ONE opaque VoiceOver/TalkBack node
          — without this, the brand list and Cancel link below would never be individually
          reachable. The backdrop's own tap-to-dismiss no longer needs a role/label since it's not
          exposed to a screen reader as its own element at all now. */}
      <Pressable style={styles.backdrop} onPress={onCancel} accessible={false}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()} accessible={false}>
          <Text style={styles.title} numberOfLines={2}>
            What is {row?.title}?
          </Text>
          <Text style={styles.body}>Pick the brand. Its address ({row?.device.ip}) carries over.</Text>
          <BrandOptionList brands={brands} onPick={onPick} accessibilityLabelFor={(brand) => `It's a ${brand.label}`} searchAfter={SEARCH_AFTER} />
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
  cancel: { minHeight: MIN_TARGET, alignItems: "center", justifyContent: "center", borderTopWidth: 1, borderTopColor: theme.border },
  cancelLabel: { color: theme.textSecondary, fontSize: theme.type.body, fontWeight: "600", textAlign: "center" },
});
