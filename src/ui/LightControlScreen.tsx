import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommandEngine } from "../core/engine/CommandEngine";
import { StateStore } from "../core/state/StateStore";
import { CapabilityId } from "../core/types/Capability";
import { Device } from "../core/types/Device";
import { DeviceState } from "../core/types/DeviceState";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";
import { useSwipeBackGesture } from "./useSwipeBackGesture";

interface LightControlScreenProps {
  device: Device;
  commandEngine: CommandEngine;
  stateStore: StateStore;
  onReconnect: () => Promise<void>;
  onRename: (device: Device, newName: string) => void;
  onBack: () => void;
}

const BRIGHTNESS_STEP = 10;

// A small fixed palette rather than a full color picker (ADR-HEARTH-032) — matches this app's
// existing "remote button" interaction model (discrete presses, not continuous gestures) and
// needs no new dependency. Each swatch is a real color at full saturation; hue in degrees
// (CSS-style HSL), matching the universal units setColor's args already use.
const COLOR_SWATCHES: { label: string; hue: number; saturation: number; swatch: string }[] = [
  { label: "Red", hue: 0, saturation: 100, swatch: "#FF3B30" },
  { label: "Orange", hue: 30, saturation: 100, swatch: "#FF9500" },
  { label: "Yellow", hue: 55, saturation: 100, swatch: "#FFD60A" },
  { label: "Green", hue: 120, saturation: 100, swatch: "#34C759" },
  { label: "Cyan", hue: 190, saturation: 100, swatch: "#32ADE6" },
  { label: "Blue", hue: 225, saturation: 100, swatch: "#0A84FF" },
  { label: "Purple", hue: 280, saturation: 100, swatch: "#AF52DE" },
  { label: "Pink", hue: 330, saturation: 90, swatch: "#FF2D55" },
  { label: "Warm white", hue: 40, saturation: 20, swatch: "#FFF3D6" },
];

function has(device: Device, capability: CapabilityId): boolean {
  return device.capabilities.includes(capability);
}

/** One light's controls (ADR-HEARTH-032) — power, brightness, color. Deliberately not a scaled-down UniversalTvRemote: a light's capability set (power/setBrightness/setColor) shares no real controls with a TV remote's, so reusing that screen would mean hiding almost everything in it rather than actually fitting the device. */
export function LightControlScreen({ device, commandEngine, stateStore, onReconnect, onRename, onBack }: LightControlScreenProps) {
  // See DiscoverDevicesScreen.tsx's identical comment — a hardcoded paddingTop guessed for an
  // iPhone notch never accounted for Android's own, differently-sized status bar.
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<DeviceState>(() => stateStore.get(device.id));
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(device.name);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState("");

  async function handleReconnectPress() {
    setReconnecting(true);
    setReconnectError("");
    try {
      await onReconnect();
    } catch (err) {
      setReconnectError(err instanceof Error ? err.message : String(err));
    } finally {
      setReconnecting(false);
    }
  }

  // Same "try immediately, don't make the user notice and tap Reconnect" reasoning as
  // UniversalTvRemote — see its identical effect for the fuller rationale.
  useEffect(() => {
    if (stateStore.get(device.id).connection !== "connected") {
      handleReconnectPress();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id]);

  useEffect(() => {
    setState(stateStore.get(device.id));
    return stateStore.subscribe(device.id, setState);
  }, [device.id, stateStore]);

  useEffect(() => {
    setEditingName(false);
    setNameInput(device.name);
  }, [device.id, device.name]);

  function commitNameEdit() {
    setEditingName(false);
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== device.name) {
      onRename(device, trimmed);
    } else {
      setNameInput(device.name);
    }
  }

  function send(capability: CapabilityId, args?: Record<string, unknown>) {
    commandEngine.execute({ deviceId: device.id, capability, args });
  }

  const isConnected = state.connection === "connected";
  const controlsDisabled = !isConnected;
  const isOn = state.values.power === "on";
  const brightness = typeof state.values.brightness === "number" ? state.values.brightness : 0;
  const hue = typeof state.values.hue === "number" ? state.values.hue : 0;
  const saturation = typeof state.values.saturation === "number" ? state.values.saturation : 0;

  function adjustBrightness(delta: number) {
    const next = Math.max(0, Math.min(100, brightness + delta));
    send("setBrightness", { brightness: next });
  }

  const swipeBackHandlers = useSwipeBackGesture(onBack);

  return (
    <View style={styles.container} {...swipeBackHandlers}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to devices" hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerDivider}>|</Text>
        <View style={styles.headerText}>
          {editingName ? (
            <TextInput
              style={styles.deviceNameInput}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
              selectTextOnFocus
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={commitNameEdit}
              onBlur={commitNameEdit}
            />
          ) : (
            <Pressable style={styles.deviceNameRow} onPress={() => setEditingName(true)} accessibilityRole="button" accessibilityLabel={`Rename ${device.name}`}>
              <Text style={styles.deviceName} numberOfLines={1}>
                {device.name}
              </Text>
              <Ionicons name="pencil-outline" size={14} color={theme.textTertiary} />
            </Pressable>
          )}
          <Text style={styles.deviceMeta} numberOfLines={1}>
            {device.manufacturer}
          </Text>
        </View>
        {has(device, "power") && (
          <CapabilityButton
            shape="circle"
            icon="power"
            label="Power"
            variant={isOn ? "accent" : "ghost"}
            onPress={() => send("power")}
            disabled={controlsDisabled}
          />
        )}
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.statusPill, isConnected ? styles.statusPillOn : styles.statusPillOff]}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? theme.statusOn : theme.statusOff }]} />
          <Text style={styles.statusPillText}>{isConnected ? "Connected" : state.connection}</Text>
        </View>
        <View style={styles.statusPill}>
          <Ionicons name={isOn ? "bulb" : "bulb-outline"} size={14} color={theme.textSecondary} />
          <Text style={styles.statusPillText}>{isOn ? "On" : "Off"}</Text>
        </View>
      </View>

      {!isConnected && (
        <View style={styles.reconnectCard}>
          <Text style={styles.reconnectText}>{reconnectError || "Not connected"}</Text>
          <CapabilityButton label={reconnecting ? "Reconnecting..." : "Reconnect"} variant="accent" onPress={handleReconnectPress} disabled={reconnecting} />
        </View>
      )}

      {has(device, "setBrightness") && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Brightness</Text>
          <View style={styles.stepperRow}>
            <CapabilityButton shape="circle" icon="remove" label="Dimmer" onPress={() => adjustBrightness(-BRIGHTNESS_STEP)} disabled={controlsDisabled} />
            <Text style={styles.stepperValue}>{brightness}%</Text>
            <CapabilityButton shape="circle" icon="add" label="Brighter" onPress={() => adjustBrightness(BRIGHTNESS_STEP)} disabled={controlsDisabled} />
          </View>
        </View>
      )}

      {has(device, "setColor") && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Color</Text>
          <View style={styles.swatchRow}>
            {COLOR_SWATCHES.map((color) => {
              const active = color.hue === hue && color.saturation === saturation;
              return (
                <Pressable
                  key={color.label}
                  onPress={() => send("setColor", { hue: color.hue, saturation: color.saturation })}
                  disabled={controlsDisabled}
                  accessibilityRole="button"
                  accessibilityLabel={color.label}
                  style={[styles.swatch, { backgroundColor: color.swatch }, active && styles.swatchActive, controlsDisabled && styles.swatchDisabled]}
                />
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm },
  headerDivider: { color: theme.textTertiary, fontSize: theme.type.subtitle },
  // minWidth: 0 overrides Yoga's default min-content floor for a flex:1 item — same fix as
  // DeviceListScreen's and UniversalTvRemote's own headers (ADR-HEARTH-046): this screen has the
  // identical shape (back chevron, divider, flex:1 name/manufacturer, a fixed Power circle button)
  // and was missed by that pass — a renamed light (up to 40 characters) can overlap the Power
  // button without this, the same way a renamed TV could on the two screens that were fixed.
  headerText: { flex: 1, minWidth: 0 },
  // Real bug found by code review (2026-09-12), same mechanism as ADR-HEARTH-053 on the TV remote
  // screen: this row has no alignSelf:flex-start, so it does correctly stretch to headerText's
  // bounded width — but deviceName's Text still defaulted to flexShrink:0, a row child's normal
  // default, which lets it render at its full natural width regardless of the row's own bound and
  // overflow past it (a View doesn't clip overflow by default), pushing the pencil icon into the
  // power button on a long device name exactly like the TV remote screen did before that fix.
  // minWidth: 0 on the row itself is the same New-Architecture Yoga min-content-floor fix used
  // everywhere else in this codebase.
  deviceNameRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, minWidth: 0 },
  // Sean, directly (2026-09-12, applied to the TV remote screen — matched here for consistency):
  // "make the header font smaller" — subtitle (17) instead of title (24) for a per-visit device
  // name, same reasoning as UniversalTvRemote.tsx's identical change.
  deviceName: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700", flexShrink: 1 },
  deviceNameInput: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700", padding: 0 },
  deviceMeta: { color: theme.textTertiary, fontSize: theme.type.caption, marginTop: theme.spacing.xs },
  statusRow: { flexDirection: "row", gap: theme.spacing.sm, flexWrap: "wrap" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    backgroundColor: theme.surfaceRaised,
    borderRadius: theme.radius.full,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  statusPillOn: { backgroundColor: theme.statusOnSoft },
  statusPillOff: { backgroundColor: theme.surfaceRaised },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { color: theme.textSecondary, fontSize: theme.type.caption, fontWeight: "600" },
  reconnectCard: {
    backgroundColor: theme.statusErrorSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    alignItems: "center",
  },
  reconnectText: { color: theme.statusError, fontSize: theme.type.label, textAlign: "center" },
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  cardLabel: { color: theme.textSecondary, fontSize: theme.type.label, fontWeight: "600" },
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.spacing.lg },
  stepperValue: { color: theme.textPrimary, fontSize: theme.type.title, fontWeight: "700", minWidth: 64, textAlign: "center" },
  swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md },
  swatch: { width: 44, height: 44, borderRadius: theme.radius.full, borderWidth: 2, borderColor: "transparent" },
  swatchActive: { borderColor: theme.textPrimary },
  swatchDisabled: { opacity: 0.35 },
});
