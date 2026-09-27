import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HaImportCandidate, NO_AREA_LABEL, defaultSelection, groupByArea } from "../drivers/homeAssistant/haImportCandidates";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface HomeAssistantSyncScreenProps {
  candidates: HaImportCandidate[];
  /** True when the area list could not be read, so every device is under "No area". */
  areasUnavailable: boolean;
  busy: boolean;
  error: string | null;
  onImport: (chosen: HaImportCandidate[]) => void;
  onBack: () => void;
}

const ROW_ICON_SIZE = 22;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * The bulk "Sync from Home Assistant" list (ADR-HEARTH-175): importable entities grouped by Home Assistant area,
 * each with a checkbox (everything new is ticked), and one Import button. An area becomes the device's Hearth room.
 */
export function HomeAssistantSyncScreen({ candidates, areasUnavailable, busy, error, onImport, onBack }: HomeAssistantSyncScreenProps) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Set<string>>(() => defaultSelection(candidates));
  const groups = useMemo(() => groupByArea(candidates), [candidates]);
  const newCount = candidates.filter((c) => !c.alreadyAdded).length;

  function toggle(entityId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(entityId)) next.add(entityId);
      return next;
    });
  }

  function setGroup(list: HaImportCandidate[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      list.filter((c) => !c.alreadyAdded).forEach((c) => (on ? next.add(c.entityId) : next.delete(c.entityId)));
      return next;
    });
  }

  const chosen = candidates.filter((c) => selected.has(c.entityId));

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]}>
        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="sync-outline" size={20} color={theme.accentEnd} />
          </View>
          <Text style={styles.title}>Sync from Home Assistant</Text>
        </View>
        <View style={styles.hintCard}>
          <Text style={styles.hint}>
            {newCount === 0
              ? "Everything Home Assistant can share with Hearth is already added."
              : `${plural(newCount, "new device")} found. Each Home Assistant area becomes a room in Hearth. Untick anything you do not want.`}
          </Text>
          {candidates.some((c) => c.category === "sensor" && !c.alreadyAdded) && <Text style={styles.hint}>Sensors are unticked to start with. Tick the ones you want as read-only tiles.</Text>}
          {areasUnavailable &&<Text style={styles.hint}>Home Assistant's area list could not be read, so no rooms will be set.</Text>}
        </View>

        {groups.map((group) => (
          <View key={group.areaName ?? "none"} style={localStyles.group}>
            <View style={localStyles.groupHeader}>
              <Text style={localStyles.groupTitle}>{group.areaName ?? NO_AREA_LABEL}</Text>
              <Pressable onPress={() => setGroup(group.candidates, !group.candidates.filter((c) => !c.alreadyAdded).every((c) => selected.has(c.entityId)))} accessibilityRole="button" accessibilityLabel={`Toggle all in ${group.areaName ?? NO_AREA_LABEL}`} hitSlop={8}>
                <Text style={localStyles.groupAction}>Toggle all</Text>
              </Pressable>
            </View>
            {group.candidates.map((candidate) => (
              <CandidateRow key={candidate.entityId} candidate={candidate} checked={selected.has(candidate.entityId)} onToggle={() => toggle(candidate.entityId)} />
            ))}
          </View>
        ))}
        {candidates.length === 0 && <Text style={styles.hint}>Nothing that Hearth can control was found in this Home Assistant.</Text>}

        {error && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
            <Text style={styles.error}>Couldn't import: {error}</Text>
          </View>
        )}

        <View style={styles.row}>
          <CapabilityButton label="Back" variant="ghost" onPress={onBack} disabled={busy} />
          <CapabilityButton label={busy ? "Importing..." : `Import ${plural(chosen.length, "device")}`} variant="accent" onPress={() => onImport(chosen)} disabled={busy || chosen.length === 0} />
        </View>
        {busy && <ActivityIndicator color={theme.accentEnd} style={styles.spinner} />}
      </ScrollView>
    </View>
  );
}

function CandidateRow({ candidate, checked, onToggle }: { candidate: HaImportCandidate; checked: boolean; onToggle: () => void }) {
  const disabled = candidate.alreadyAdded;
  const state = disabled ? "already added" : checked ? "selected" : "not selected";
  return (
    <Pressable
      style={[localStyles.row, disabled && localStyles.rowDisabled]}
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={`${candidate.name}, ${state}`}
    >
      <Ionicons name={disabled ? "checkmark-circle" : checked ? "checkbox" : "square-outline"} size={ROW_ICON_SIZE} color={disabled ? theme.textTertiary : checked ? theme.accentEnd : theme.textSecondary} />
      <View style={localStyles.rowText}>
        <Text style={localStyles.rowName} numberOfLines={1}>{candidate.name}</Text>
        <Text style={localStyles.rowMeta}>{disabled ? "Already added" : candidate.domain.replace("_", " ")}</Text>
      </View>
    </Pressable>
  );
}

const localStyles = StyleSheet.create({
  group: { marginTop: theme.spacing.md, gap: theme.spacing.xs },
  groupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: theme.spacing.xs },
  groupTitle: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "700" },
  groupAction: { color: theme.accentEnd, fontSize: theme.type.label, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, backgroundColor: theme.surface, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.borderSubtle, padding: theme.spacing.md },
  rowDisabled: { opacity: 0.55 },
  rowText: { flex: 1 },
  rowName: { color: theme.textPrimary, fontSize: theme.type.body },
  rowMeta: { color: theme.textSecondary, fontSize: theme.type.label, textTransform: "capitalize" },
});
