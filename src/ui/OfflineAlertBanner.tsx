import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { CommandEngine } from "../core/engine/CommandEngine";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { theme } from "./theme";
import { useOfflineAlert } from "./useOfflineAlert";

interface OfflineAlertBannerProps {
  devices: readonly Device[];
  stateStore: StateStore;
  driverRegistry: DriverRegistry;
  commandEngine: CommandEngine;
  fccConfigured: boolean;
  onReconnect: (device: Device) => Promise<void>;
  /** Opens a device's own screen; the "Re-pair" action uses it so the person can watch the TV while approving. */
  onOpenDevice: (device: Device) => void;
}

function canWake(device: Device, driverRegistry: DriverRegistry): boolean {
  return device.capabilities.includes("powerOn") || (driverRegistry.get(device.driverId)?.getCapabilities().includes("powerOn") ?? false);
}

/** Calm, dismissible one-line banner for a silent failure: the relay not answering, or a device that has stopped answering (ADR-HEARTH-172). Renders nothing while healthy. */
export function OfflineAlertBanner({ devices, stateStore, driverRegistry, commandEngine, fccConfigured, onReconnect, onOpenDevice }: OfflineAlertBannerProps) {
  const { alert, dismiss, recheckFcc } = useOfflineAlert({ devices, stateStore, fccConfigured });
  // ADR-HEARTH-180: this banner can appear, change message (relay unreachable -> a specific
  // device gone silent) or disappear with nobody looking at the screen — accessibilityRole="alert"
  // alone isn't a reliable cross-platform announcement trigger, so an explicit
  // announceForAccessibility call covers VoiceOver (iOS) while accessibilityLiveRegion below covers
  // TalkBack (Android) for the same text change.
  useEffect(() => {
    if (alert) AccessibilityInfo.announceForAccessibility(alert.message);
  }, [alert?.message]);
  if (!alert) return null;
  const device = alert.kind === "device" ? devices.find((candidate) => candidate.id === alert.deviceId) : undefined;
  const showWake = device !== undefined && canWake(device, driverRegistry);
  // ADR-HEARTH-223: a device whose saved pairing was refused gets one "Re-pair" action (which opens its remote, where the TV can be watched) instead of Wake/Retry.
  const rePairAlert = alert.kind === "device" && alert.needsRePair;

  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name={alert.kind === "fcc" ? "cloud-offline-outline" : "time-outline"} size={16} color={theme.textTertiary} />
      <Text style={styles.text}>{alert.message}</Text>
      {alert.kind === "fcc" && <ActionButton label="Retry" onPress={recheckFcc} />}
      {device && alert.kind === "device" && alert.needsRePair && <ActionButton label="Re-pair" onPress={() => onOpenDevice(device)} />}
      {device && showWake && !rePairAlert && <ActionButton label="Wake" onPress={() => void commandEngine.execute({ deviceId: device.id, capability: "powerOn" })} />}
      {device && !rePairAlert && <ActionButton label="Retry" onPress={() => void onReconnect(device)} />}
      <Pressable onPress={dismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Ionicons name="close" size={16} color={theme.textTertiary} />
      </Pressable>
    </View>
  );
}

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.action} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  text: { flex: 1, minWidth: 0,color: theme.textSecondary, fontSize: theme.type.label },
  action: { backgroundColor: theme.surfaceRaised, borderRadius: theme.radius.sm, paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.md },
  actionLabel: { color: theme.accentEnd, fontWeight: "700", fontSize: theme.type.label },
});
