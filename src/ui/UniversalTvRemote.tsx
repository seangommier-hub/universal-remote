import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { CommandEngine } from "../core/engine/CommandEngine";
import { StateStore } from "../core/state/StateStore";
import { CapabilityId } from "../core/types/Capability";
import { Device } from "../core/types/Device";
import { DeviceState } from "../core/types/DeviceState";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface UniversalTvRemoteProps {
  device: Device;
  commandEngine: CommandEngine;
  stateStore: StateStore;
}

function has(device: Device, capability: CapabilityId): boolean {
  return device.capabilities.includes(capability);
}

/**
 * One remote screen that works for any TV driver. Every control shown here is gated on the
 * device's declared capabilities — this file has no Samsung- or LG-specific logic at all.
 */
export function UniversalTvRemote({ device, commandEngine, stateStore }: UniversalTvRemoteProps) {
  const [state, setState] = useState<DeviceState>(() => stateStore.get(device.id));

  useEffect(() => {
    setState(stateStore.get(device.id));
    return stateStore.subscribe(device.id, setState);
  }, [device.id, stateStore]);

  function send(capability: CapabilityId, args?: Record<string, unknown>) {
    commandEngine.execute({ deviceId: device.id, capability, args });
  }

  const isOn = state.values.power === "on";
  const volume = typeof state.values.volume === "number" ? state.values.volume : undefined;
  const channel = typeof state.values.channel === "number" ? state.values.channel : undefined;
  const muted = state.values.muted === true;
  const input = typeof state.values.input === "string" ? state.values.input : undefined;
  const isConnected = state.connection === "connected";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View>
        <Text style={styles.deviceName}>{device.name}</Text>
        <Text style={styles.deviceMeta}>
          {device.manufacturer} {device.model}
        </Text>
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.statusPill, isConnected ? styles.statusPillOn : styles.statusPillOff]}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? theme.statusOn : theme.statusOff }]} />
          <Text style={styles.statusPillText}>{isConnected ? "Connected" : state.connection}</Text>
        </View>
        <View style={styles.statusPill}>
          <Ionicons name={isOn ? "power" : "power-outline"} size={14} color={theme.textSecondary} />
          <Text style={styles.statusPillText}>{isOn ? "On" : "Off"}</Text>
        </View>
        {volume !== undefined && (
          <View style={styles.statusPill}>
            <Ionicons name={muted ? "volume-mute-outline" : "volume-medium-outline"} size={14} color={theme.textSecondary} />
            <Text style={styles.statusPillText}>{volume}</Text>
          </View>
        )}
        {channel !== undefined && (
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>Ch {channel}</Text>
          </View>
        )}
        {input !== undefined && (
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>{input}</Text>
          </View>
        )}
      </View>

      {(has(device, "power") || has(device, "powerOn") || has(device, "powerOff")) && (
        <View style={styles.card}>
          <View style={styles.row}>
            {has(device, "power") && (
              <CapabilityButton icon="power" label="Power" variant="accent" onPress={() => send("power")} />
            )}
            {has(device, "powerOn") && (
              <CapabilityButton icon="power" label="Power On" variant="accent" onPress={() => send("powerOn")} />
            )}
            {has(device, "powerOff") && (
              <CapabilityButton icon="power-outline" label="Power Off" onPress={() => send("powerOff")} />
            )}
          </View>
        </View>
      )}

      {(has(device, "volumeUp") || has(device, "volumeDown") || has(device, "mute")) && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Volume</Text>
          <View style={styles.row}>
            {has(device, "volumeDown") && (
              <CapabilityButton icon="volume-low-outline" label="Vol -" onPress={() => send("volumeDown")} />
            )}
            {has(device, "mute") && (
              <CapabilityButton
                icon={muted ? "volume-mute" : "volume-medium-outline"}
                label={muted ? "Unmute" : "Mute"}
                onPress={() => send("mute")}
              />
            )}
            {has(device, "volumeUp") && (
              <CapabilityButton icon="volume-high-outline" label="Vol +" onPress={() => send("volumeUp")} />
            )}
          </View>
        </View>
      )}

      {(has(device, "channelUp") || has(device, "channelDown")) && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Channel</Text>
          <View style={styles.row}>
            {has(device, "channelDown") && (
              <CapabilityButton icon="remove-outline" label="Ch -" onPress={() => send("channelDown")} />
            )}
            {has(device, "channelUp") && <CapabilityButton icon="add-outline" label="Ch +" onPress={() => send("channelUp")} />}
          </View>
        </View>
      )}

      {has(device, "directionalNavigation") && (
        <View style={styles.card}>
          <View style={styles.dpad}>
            <CapabilityButton shape="circle" icon="chevron-up" label="Up" onPress={() => send("directionalNavigation", { direction: "up" })} />
            <View style={styles.dpadMiddleRow}>
              <CapabilityButton
                shape="circle"
                icon="chevron-back"
                label="Left"
                onPress={() => send("directionalNavigation", { direction: "left" })}
              />
              {has(device, "select") ? (
                <CapabilityButton shape="circle" icon="checkmark" label="Select" variant="accent" onPress={() => send("select")} />
              ) : (
                <View style={styles.dpadCenterSpacer} />
              )}
              <CapabilityButton
                shape="circle"
                icon="chevron-forward"
                label="Right"
                onPress={() => send("directionalNavigation", { direction: "right" })}
              />
            </View>
            <CapabilityButton
              shape="circle"
              icon="chevron-down"
              label="Down"
              onPress={() => send("directionalNavigation", { direction: "down" })}
            />
          </View>
        </View>
      )}

      {(has(device, "back") || has(device, "home") || has(device, "menu")) && (
        <View style={styles.card}>
          <View style={styles.row}>
            {has(device, "back") && <CapabilityButton icon="arrow-back-outline" label="Back" onPress={() => send("back")} />}
            {has(device, "home") && <CapabilityButton icon="home-outline" label="Home" onPress={() => send("home")} />}
            {has(device, "menu") && <CapabilityButton icon="menu-outline" label="Menu" onPress={() => send("menu")} />}
          </View>
        </View>
      )}

      {has(device, "inputSelection") && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Input</Text>
          <View style={styles.row}>
            {["hdmi1", "hdmi2", "hdmi3"].map((option) => (
              <CapabilityButton
                key={option}
                icon="tv-outline"
                label={option.toUpperCase()}
                onPress={() => send("inputSelection", { input: option })}
              />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { padding: theme.spacing.xl, gap: theme.spacing.lg },
  deviceName: { color: theme.textPrimary, fontSize: theme.type.title, fontWeight: "700" },
  deviceMeta: { color: theme.textSecondary, fontSize: theme.type.body, marginTop: 2 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.surfaceRaised,
    borderRadius: theme.radius.full,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.md,
  },
  statusPillOn: { backgroundColor: theme.statusOnSoft },
  statusPillOff: { backgroundColor: theme.surfaceRaised },
  statusDot: { width: 7, height: 7, borderRadius: theme.radius.full },
  statusPillText: { color: theme.textSecondary, fontSize: theme.type.caption, fontWeight: "600" },
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  cardLabel: {
    color: theme.textSecondary,
    fontSize: theme.type.label,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: { flexDirection: "row", gap: theme.spacing.md, alignItems: "center", justifyContent: "center" },
  dpad: { alignItems: "center", gap: theme.spacing.md },
  dpadMiddleRow: { flexDirection: "row", gap: theme.spacing.md, alignItems: "center" },
  dpadCenterSpacer: { width: 52, height: 52 },
});
