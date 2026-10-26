import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { StyleSheet, View } from "react-native";
import { CapabilityId } from "../core/types/Capability";
import { Device } from "../core/types/Device";
import { CapabilityButton } from "./CapabilityButton";
import { has } from "./hasCapability";
import { theme } from "./theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

const TRANSPORT_BUTTONS: readonly { capability: CapabilityId; icon: IconName; label: string }[] = [
  { capability: "rewind", icon: "play-back", label: "Rewind" },
  { capability: "play", icon: "play", label: "Play" },
  { capability: "pause", icon: "pause", label: "Pause" },
  { capability: "fastForward", icon: "play-forward", label: "Fast forward" },
];

interface TransportControlsRowProps {
  device: Device;
  scale: number;
  disabled: boolean;
  onSend: (capability: CapabilityId) => void;
}

/** Rewind / play / pause / fast-forward: one button per transport capability the device declares (ADR-HEARTH-234). */
export function TransportControlsRow({ device, scale, disabled, onSend }: TransportControlsRowProps) {
  const buttons = TRANSPORT_BUTTONS.filter(({ capability }) => has(device, capability));
  if (buttons.length === 0) return null;
  return (
    <View style={[styles.row, { marginTop: theme.spacing.sm * scale, gap: theme.spacing.md * scale }]}>
      {buttons.map(({ capability, icon, label }) => (
        <CapabilityButton
          key={capability}
          shape="circle"
          size="xs"
          scale={scale}
          icon={icon}
          label={label}
          onPress={() => onSend(capability)}
          disabled={disabled}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
});
