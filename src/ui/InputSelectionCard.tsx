import { StyleSheet, View } from "react-native";
import { CapabilityButton } from "./CapabilityButton";
import { remoteCardStyles } from "./remoteCardStyles";
import { useRemoteScaled } from "./RemoteScaleContext";
import { theme } from "./theme";

interface InputOption {
  id: string;
  label: string;
}

interface InputSelectionCardProps {
  /** LG's real input ids/labels read live off the TV, or undefined for every other driver — see UniversalTvRemote.tsx's own dynamicInputs comment. Falls back to the static hdmi1/2/3 list. */
  options: InputOption[] | undefined;
  selectedInput: string | undefined;
  disabled: boolean;
  onSelect: (inputId: string) => void;
}

const STATIC_INPUT_OPTIONS: InputOption[] = ["hdmi1", "hdmi2", "hdmi3"].map((id) => ({ id, label: id.toUpperCase() }));

/**
 * Real-device ask (2026-09-10): "the inputs should be above the card above" — rendered ahead of
 * the utility row (Mute/Back/Home/Menu/...) by its caller, rather than after it.
 */
export function InputSelectionCard({ options, selectedInput, disabled, onSelect }: InputSelectionCardProps) {
  const { size } = useRemoteScaled();
  return (
    <View style={[remoteCardStyles.card, remoteCardStyles.compactCard, { padding: size(theme.spacing.sm), borderRadius: size(theme.radius.lg) }]}>
      {/* Real-device ask (2026-09-10): "change the arrangement of the inputs to be fewer
          rows" — the old plain flexWrap (no column count) let the number of buttons per row
          vary with each label's own width, so a TV reporting several inputs with longer names
          (e.g. "Component", "Antenna") could wrap down to 2 per row, stretching a 6-7-input list
          to 3-4 rows. Fixed at 3 columns regardless of label length — deterministic row count
          (ceil(inputs/3)) instead of however-many-happen-to-fit. numberOfLines=1 on each button
          (CapabilityButton's own prop) keeps a longer label from wrapping to a second line and
          giving just that one tile a different height than its row-mates — same fix already
          applied to the utility row for the same reason. */}
      <View style={[styles.inputGrid, { gap: size(theme.spacing.sm) }]}>
        {(options ?? STATIC_INPUT_OPTIONS).map((option) => (
          <CapabilityButton
            key={option.id}
            label={option.label}
            variant={selectedInput === option.id ? "accent" : "default"}
            selected={selectedInput === option.id}
            onPress={() => onSelect(option.id)}
            disabled={disabled}
            numberOfLines={1}
            containerStyle={styles.inputTile}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fixed 3-column grid for input-selection (see this file's own comment) — same
  // flexBasis-percentage + gap technique DeviceListScreen.tsx's addGrid already uses for its own
  // 2-column layout: 3 × 31% = 93%, leaving real margin for the gap between tiles (2 gaps of
  // spacing.sm ≈ 5% of this card's interior width) without overflowing 100%.
  inputGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  // No flexGrow: a remainder tile on the last row (e.g. 7 inputs = two full rows + one leftover)
  // must NOT stretch to fill the row on its own — that's the exact "boxes not the same size" bug
  // the streaming row's own fix (StreamingAppsRow.tsx) already had to correct for the same reason.
  inputTile: { flexBasis: "31%" },
});
