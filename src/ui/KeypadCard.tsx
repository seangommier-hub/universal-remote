import { StyleSheet, Text, View } from "react-native";
import { CapabilityButton } from "./CapabilityButton";
import { remoteCardStyles } from "./remoteCardStyles";
import { theme } from "./theme";

const KEYPAD_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

interface KeypadCardProps {
  scale: number;
  channelInput: string;
  disabled: boolean;
  /** Whether a "select"/"selectPlayPause" capability exists to send on Enter — see this card's own Enter button. */
  canSubmit: boolean;
  onPressDigit: (digit: string) => void;
  onClear: () => void;
  onEnter: () => void;
}

/** The remote screen's "Keypad" tab — a numeric grid plus Clear/0/Enter, mirroring a physical remote's number pad. */
export function KeypadCard({ scale, channelInput, disabled, canSubmit, onPressDigit, onClear, onEnter }: KeypadCardProps) {
  return (
    <View style={remoteCardStyles.card}>
      <View style={styles.keypadHeader}>
        <Text style={remoteCardStyles.cardLabel}>Number Keys</Text>
        <Text style={styles.keypadDisplay}>{channelInput.length > 0 ? channelInput : "—"}</Text>
      </View>
      {KEYPAD_ROWS.map((digitRow) => (
        <View key={digitRow.join("")} style={styles.row}>
          {digitRow.map((digit) => (
            <CapabilityButton key={digit} shape="circle" scale={scale} label={digit} onPress={() => onPressDigit(digit)} disabled={disabled} />
          ))}
        </View>
      ))}
      <View style={styles.row}>
        <CapabilityButton
          shape="circle"
          scale={scale}
          icon="backspace-outline"
          label="Clear"
          variant="ghost"
          onPress={onClear}
          disabled={disabled || channelInput.length === 0}
        />
        <CapabilityButton shape="circle" scale={scale} label="0" onPress={() => onPressDigit("0")} disabled={disabled} />
        <CapabilityButton
          shape="circle"
          scale={scale}
          icon="checkmark"
          label="Enter"
          variant="accent"
          onPress={onEnter}
          disabled={disabled || !canSubmit}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  keypadHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  keypadDisplay: { color: theme.textPrimary, fontSize: theme.type.title, fontWeight: "700", letterSpacing: 2, minWidth: 48, textAlign: "right" },
  row: { flexDirection: "row", gap: theme.spacing.md, alignItems: "center", justifyContent: "center", flexWrap: "wrap" },
});
