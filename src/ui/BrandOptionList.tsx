import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { BrandEntry } from "../discovery/brandRegistry";
import { searchBrands } from "../discovery/brandSearch";
import { brandVisual } from "../discovery/brandVisuals";
import { theme } from "./theme";

const MIN_TARGET = 44;
const TILE_SIZE = 36;
const SEARCH_ICON_SIZE = 18;
const CATEGORY_ICON_SIZE = 16;

interface BrandOptionListProps {
  brands: BrandEntry[];
  onPick: (brand: BrandEntry) => void;
  /** Builds the button's spoken label, e.g. "It's a Roku" or "Add Roku". */
  accessibilityLabelFor: (brand: BrandEntry) => string;
  /** Shows the search box only when there are enough brands to make scrolling tedious. */
  searchAfter?: number;
}

/** A brand's colored monogram tile: the logo stand-in the picker scans by. */
export function BrandTile({ brand }: { brand: BrandEntry }) {
  const visual = brandVisual(brand);
  return (
    <View style={[styles.tile, { backgroundColor: visual.tint, borderColor: visual.color }]}>
      <Text style={[styles.monogram, { color: visual.color }]}>{visual.monogram}</Text>
    </View>
  );
}

/** Searchable (typo-tolerant) list of brands with a logo tile, name and one-line hint; used by both brand pickers (ADR-HEARTH-167). */
export function BrandOptionList({ brands, onPick, accessibilityLabelFor, searchAfter = 0 }: BrandOptionListProps) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => searchBrands(brands, query), [brands, query]);
  return (
    <View style={styles.wrap}>
      {brands.length > searchAfter && (
        <View style={styles.search}>
          <Ionicons name="search-outline" size={SEARCH_ICON_SIZE} color={theme.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search brands (Samsung, webOS, Hue...)"
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel="Search brands"
          />
        </View>
      )}
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {shown.map((brand) => (
          <Pressable key={brand.id} style={({ pressed }) => [styles.option, pressed && styles.optionPressed]} onPress={() => onPick(brand)} accessibilityRole="button" accessibilityLabel={accessibilityLabelFor(brand)}>
            <BrandTile brand={brand} />
            <Text style={styles.optionLabel} numberOfLines={1}>{brand.label}</Text>
            <Ionicons name={brand.icon} size={CATEGORY_ICON_SIZE} color={theme.textTertiary} />
          </Pressable>
        ))}
        {shown.length === 0 && <Text style={styles.empty}>No brand matches "{query.trim()}". Check the spelling, or try the kind of device (TV, speaker, plug).</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  search: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, minHeight: MIN_TARGET, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.borderSubtle },
  searchInput: { flex: 1, color: theme.textPrimary, fontSize: theme.type.body, minHeight: MIN_TARGET },
  list: { flexGrow: 0, maxHeight: 360 },
  option: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, minHeight: MIN_TARGET + theme.spacing.xs, borderRadius: theme.radius.sm, paddingRight: theme.spacing.sm },
  optionPressed: { backgroundColor: theme.surface },
  optionLabel: { flex: 1, color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "600" },
  tile: { width: TILE_SIZE, height: TILE_SIZE, borderRadius: theme.radius.sm, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  monogram: { fontSize: theme.type.label, fontWeight: "800" },
  empty: { color: theme.textSecondary, fontSize: theme.type.label, paddingVertical: theme.spacing.md },
});
