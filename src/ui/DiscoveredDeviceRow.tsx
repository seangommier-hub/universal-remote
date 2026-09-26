import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { KIND_ICON } from "../discovery/deviceKind";
import { DiscoveryRow, primaryLabelFor } from "../discovery/discoveryRows";
import { canRequestSupport, looksLikeLine } from "../discovery/unsupportedReport";
import { CapabilityButton } from "./CapabilityButton";
import { DeviceInlineFields } from "./DeviceInlineFields";
import { NetworkFailureNotice } from "./NetworkFailureNotice";
import { theme } from "./theme";
import { RowUiState } from "./useAddDiscoveredDevice";

export const FCC_REQUIRED_MESSAGE = "Requires Family Command Center — set it up first.";
const ICON_SIZE = 22;
const MIN_TARGET = 44;
const SUPPORT_LINK_HEIGHT = 28;
const OFFLINE_OPACITY = 0.6;
const MORE_ACTIONS_LABEL = "More actions";

interface DiscoveredDeviceRowProps {
  row: DiscoveryRow;
  ui: RowUiState;
  onPrimary: (row: DiscoveryRow) => void;
  onSubmitFields: (row: DiscoveryRow, values: Record<string, string>) => void;
  onOpenFccSetup: () => void;
  /** Opens the row's secondary actions (hide, "It's a ..."); omit to show no overflow. */
  onMore?: (row: DiscoveryRow) => void;
  /** ADR-HEARTH-167: sends a prefilled "please support this device" report; omit to hide the link. */
  onRequestSupport?: (row: DiscoveryRow) => void;
}

function PrimaryButton({ row, busy, onPress }: { row: DiscoveryRow; busy: boolean; onPress: () => void }) {
  const label = primaryLabelFor(row);
  if (row.action === "added") {
    return (
      <View style={styles.addedChip} accessibilityLabel={`${row.title} is already added`}>
        <Text style={styles.addedLabel}>{label}</Text>
      </View>
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [styles.primary, row.action === "identify" && styles.secondaryLook, pressed && styles.pressed]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${row.title}`}
      accessibilityState={{ disabled: busy, busy }}
    >
      {busy ? <ActivityIndicator color={theme.background} size="small" /> : <Text style={[styles.primaryLabel, row.action === "identify" && styles.secondaryLabel]}>{label}</Text>}
    </Pressable>
  );
}

/** One network device: icon, a human title, a short subtitle, exactly one primary button, and an optional overflow for the rare actions. */
export function DiscoveredDeviceRow({ row, ui, onPrimary, onSubmitFields, onOpenFccSetup, onMore, onRequestSupport }: DiscoveredDeviceRowProps) {
  const iconName = row.brand ? row.brand.icon : KIND_ICON[row.kind];
  const dim = !row.online ? styles.dim : null;
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Pressable
          style={[styles.identity, dim]}
          onLongPress={onMore ? () => onMore(row) : undefined}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${row.title}. ${row.subtitle}`}
          accessibilityActions={onMore ? [{ name: "more", label: MORE_ACTIONS_LABEL }] : undefined}
          onAccessibilityAction={onMore ? () => onMore(row) : undefined}
        >
          <View style={styles.icon}>
            <Ionicons name={iconName} size={ICON_SIZE} color={row.brand ? theme.accentEnd : theme.textTertiary} />
          </View>
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={1}>
              {row.title}
            </Text>
            <Text style={styles.meta} numberOfLines={2}>
              {row.subtitle}
            </Text>
          </View>
        </Pressable>
        <PrimaryButton row={row} busy={ui.busy} onPress={() => onPrimary(row)} />
        {onMore && (
          <Pressable style={styles.more} onPress={() => onMore(row)} accessibilityRole="button" accessibilityLabel={`${MORE_ACTIONS_LABEL} for ${row.title}`}>
            <Ionicons name="ellipsis-horizontal" size={ICON_SIZE} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>
      {onRequestSupport && canRequestSupport(row) && (
        <View style={styles.supportRow}>
          <Text style={styles.supportLine}>{looksLikeLine(row)}</Text>
          {row.supportRequested ? (
            <Text style={styles.supportDone}>Support requested</Text>
          ) : (
            <Pressable style={styles.supportLinkTarget} onPress={() => onRequestSupport(row)} accessibilityRole="button" accessibilityLabel={`Request support for ${row.title}`} hitSlop={12}>
              <Text style={styles.supportLink}>Request support</Text>
            </Pressable>
          )}
        </View>
      )}
      {ui.error && <Text style={styles.error}>{ui.error.message}</Text>}
      {ui.error?.diagnosis && <NetworkFailureNotice diagnosis={ui.error.diagnosis} />}
      {ui.needsFcc && (
        <View style={styles.fccRow}>
          <Text style={styles.error}>{FCC_REQUIRED_MESSAGE}</Text>
          <CapabilityButton label="Set up Family Command Center" variant="accent" onPress={onOpenFccSetup} />
        </View>
      )}
      {ui.fieldsNeeded && <DeviceInlineFields fields={ui.fieldsNeeded} busy={ui.busy} onSubmit={(values) => onSubmitFields(row, values)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.spacing.sm, backgroundColor: theme.surface, borderRadius: theme.radius.lg, paddingVertical: theme.spacing.md, paddingLeft: theme.spacing.md, paddingRight: theme.spacing.sm, borderWidth: 1, borderColor: theme.borderSubtle },
  topRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  identity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: theme.spacing.md, minHeight: MIN_TARGET },
  dim: { opacity: OFFLINE_OPACITY },
  icon: { width: MIN_TARGET, height: MIN_TARGET, borderRadius: theme.radius.md, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center" },
  // minWidth 0: same long-hostname overlap guard as the other cards (ADR-HEARTH-049/053).
  body: { flex: 1, minWidth: 0 },
  title: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "600" },
  meta: { color: theme.textSecondary, fontSize: theme.type.label, marginTop: 2 },
  primary: { backgroundColor: theme.accentEnd, borderRadius: theme.radius.md, minHeight: MIN_TARGET, paddingHorizontal: theme.spacing.lg, minWidth: 84, alignItems: "center", justifyContent: "center" },
  secondaryLook: { backgroundColor: "transparent", borderWidth: 1, borderColor: theme.border },
  pressed: { opacity: 0.7 },
  primaryLabel: { color: theme.background, fontWeight: "700", fontSize: theme.type.label },
  secondaryLabel: { color: theme.textPrimary },
  addedChip: { minHeight: MIN_TARGET, paddingHorizontal: theme.spacing.lg, minWidth: 84, alignItems: "center", justifyContent: "center" },
  addedLabel: { color: theme.textTertiary, fontWeight: "600", fontSize: theme.type.label },
  more: { width: MIN_TARGET, height: MIN_TARGET, alignItems: "center", justifyContent: "center" },
  supportRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.md, paddingRight: theme.spacing.sm },
  supportLine: { flexShrink: 1, color: theme.textSecondary, fontSize: theme.type.label },
  supportLinkTarget: { minHeight: SUPPORT_LINK_HEIGHT, justifyContent: "center" },
  supportLink: { color: theme.accentEnd, fontSize: theme.type.label, fontWeight: "700" },
  supportDone: { color: theme.textTertiary, fontSize: theme.type.label },
  error: { color: theme.statusError, fontSize: theme.type.label },
  fccRow: { gap: theme.spacing.sm },
});
