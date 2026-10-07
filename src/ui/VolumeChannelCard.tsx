import { StyleSheet, Text, View } from "react-native";
import { CapabilityId } from "../core/types/Capability";
import { Device } from "../core/types/Device";
import { CapabilityButton } from "./CapabilityButton";
import { ROCKER_WIDTH } from "./dpadLayout";
import { has } from "./hasCapability";
import { remoteCardStyles } from "./remoteCardStyles";
import { theme } from "./theme";

interface VolumeChannelCardProps {
  device: Device;
  scale: number;
  scaledDpadSize: number;
  /** ADR-HEARTH-217: the live overflow-correction factor (useRemoteFitScale) -- applied here only
   * to this card's own padding/gap, never to a tap target. */
  fitScale: number;
  disabled: boolean;
  onSend: (capability: CapabilityId) => void;
}

/**
 * Fallback for a device with volume but no d-pad at all (Sony: no directionalNavigation,
 * no channel keys) — DpadCluster's merged hub needs a d-pad to anchor to, so this keeps volume
 * reachable on its own rather than disappearing.
 */
export function VolumeChannelCard({ device, scale, scaledDpadSize, fitScale, disabled, onSend }: VolumeChannelCardProps) {
  return (
    <View style={[remoteCardStyles.card, { paddingVertical: theme.spacing.md * fitScale, gap: theme.spacing.sm * fitScale }]}>
      <Text style={remoteCardStyles.cardLabel}>Volume &amp; Channel</Text>
      <View style={styles.rockerRow}>
        {(has(device, "volumeUp") || has(device, "volumeDown")) && (
          <View style={[remoteCardStyles.rockerColumn, { height: scaledDpadSize, width: ROCKER_WIDTH * scale, borderRadius: (ROCKER_WIDTH * scale) / 2 }]}>
            {has(device, "volumeUp") && (
              <CapabilityButton
                shape="circle"
                scale={scale}
                icon="chevron-up"
                label="Vol +"
                onPress={() => onSend("volumeUp")}
                disabled={disabled}
                containerStyle={styles.dpadArrow}
              />
            )}
            <Text style={remoteCardStyles.rockerColumnLabel}>Vol</Text>
            {has(device, "volumeDown") && (
              <CapabilityButton
                shape="circle"
                scale={scale}
                icon="chevron-down"
                label="Vol -"
                onPress={() => onSend("volumeDown")}
                disabled={disabled}
                containerStyle={styles.dpadArrow}
              />
            )}
          </View>
        )}
        {(has(device, "channelUp") || has(device, "channelDown")) && (
          <View style={[remoteCardStyles.rockerColumn, { height: scaledDpadSize, width: ROCKER_WIDTH * scale, borderRadius: (ROCKER_WIDTH * scale) / 2 }]}>
            {has(device, "channelUp") && (
              <CapabilityButton
                shape="circle"
                scale={scale}
                icon="chevron-up"
                label="Ch +"
                onPress={() => onSend("channelUp")}
                disabled={disabled}
                containerStyle={styles.dpadArrow}
              />
            )}
            <Text style={remoteCardStyles.rockerColumnLabel}>Ch</Text>
            {has(device, "channelDown") && (
              <CapabilityButton
                shape="circle"
                scale={scale}
                icon="chevron-down"
                label="Ch -"
                onPress={() => onSend("channelDown")}
                disabled={disabled}
                containerStyle={styles.dpadArrow}
              />
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rockerRow: { flexDirection: "row", gap: theme.spacing.xl, alignItems: "center", justifyContent: "center" },
  // Removes the individual button chrome (background+border) CapabilityButton normally draws
  // for shape="circle" — same reasoning/escape-hatch as DpadCluster.tsx's own dpadArrow style.
  dpadArrow: { backgroundColor: "transparent", borderWidth: 0 },
});
