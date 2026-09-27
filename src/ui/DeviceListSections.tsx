import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { DeviceListModel } from "../core/layout/deviceGrouping";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { DeviceCard, iconForDevice } from "./DeviceCard";
import { theme } from "./theme";

interface DeviceListSectionsProps {
  model: DeviceListModel;
  stateStore: StateStore;
  onSelect: (device: Device) => void;
  onLongPress: (device: Device) => void;
  onToggleRoom: (key: string) => void;
}

/** The favorites row (when any are starred) and the device rows, flat or grouped under collapsible room headers. */
export function DeviceListSections({ model, stateStore, onSelect, onLongPress, onToggleRoom }: DeviceListSectionsProps) {
  const favoriteIds = new Set(model.favorites.map((d) => d.id));
  return (
    <View>
      {model.favorites.length > 0 && (
        <View>
          <Text style={styles.subLabel}>Favorites</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.favoritesRow}>
            {model.favorites.map((device) => (
              <Pressable
                key={device.id}
                style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                onPress={() => onSelect(device)}
                onLongPress={() => onLongPress(device)}
                accessibilityRole="button"
                accessibilityLabel={`Favorite ${device.name}`}
                accessibilityHint="Double tap to open. Long press for more options."
              >
                <Ionicons name={iconForDevice(device)} size={22} color={theme.accentEnd} />
                <Text style={styles.tileName} numberOfLines={2}>
                  {device.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
      {model.sections.map((section) => (
        <View key={section.key || "unassigned"}>
          {model.grouped && (
            <Pressable
              style={styles.header}
              onPress={() => onToggleRoom(section.key)}
              accessibilityRole="button"
              accessibilityLabel={`${section.title}, ${section.devices.length} ${section.devices.length === 1 ? "device" : "devices"}`}
              accessibilityState={{ expanded: !section.collapsed }}
            >
              <Ionicons name={section.collapsed ? "chevron-forward" : "chevron-down"} size={16} color={theme.textSecondary} />
              <Text style={styles.headerTitle} numberOfLines={1}>
                {section.title}
              </Text>
              <Text style={styles.headerCount}>{section.devices.length}</Text>
            </Pressable>
          )}
          {!section.collapsed && (
            <View style={styles.list}>
              {section.devices.map((device) => (
                <DeviceCard key={device.id} device={device} stateStore={stateStore} favorite={favoriteIds.has(device.id)} onPress={() => onSelect(device)} onLongPress={() => onLongPress(device)} />
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  subLabel: { color: theme.textSecondary, fontSize: theme.type.label, fontWeight: "600", marginBottom: theme.spacing.sm },
  favoritesRow: { flexDirection: "row", gap: theme.spacing.sm, paddingBottom: theme.spacing.lg },
  tile: {
    width: 92,
    alignItems: "center",
    gap: theme.spacing.xs,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
  },
  tileName: { color: theme.textPrimary, fontSize: theme.type.label, fontWeight: "600", textAlign: "center" },
  pressed: { opacity: 0.6 },
  header: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingVertical: theme.spacing.sm, marginTop: theme.spacing.xs },
  headerTitle: { flexShrink: 1, color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "700" },
  headerCount: { color: theme.textTertiary, fontSize: theme.type.label, fontWeight: "600" },
  list: { gap: theme.spacing.md, paddingBottom: theme.spacing.md },
});
