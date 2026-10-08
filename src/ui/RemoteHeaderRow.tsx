import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CapabilityId } from "../core/types/Capability";
import { Device } from "../core/types/Device";
import { CapabilityButton } from "./CapabilityButton";
import { has } from "./hasCapability";
import { useRemoteScaled } from "./RemoteScaleContext";
import { theme } from "./theme";

// ADR-HEARTH-208: a 22px glyph + 8px slop each side was a 38px target, under the 44pt minimum.
const BACK_HIT_SLOP = 12;
const BACK_ICON_SIZE = 22;
const EDIT_ICON_SIZE = 14;

interface RemoteHeaderRowProps {
  device: Device;
  scale: number;
  isAway: boolean;
  editingName: boolean;
  nameInput: string;
  onChangeNameInput: (text: string) => void;
  onStartEdit: () => void;
  onCommitEdit: () => void;
  onBack: () => void;
  knownPower: "on" | "off" | undefined;
  hasSeparatePowerOnOff: boolean;
  disabled: boolean;
  onSend: (capability: CapabilityId) => void;
}

/**
 * Sean, directly: "power off should be top left or right." Sourced: LG's own official
 * ThinQ remote app puts Power in a compact top row alongside volume/mute/home, not as a
 * large standalone button — every physical remote and every real remote app treats power
 * as a top-corner icon, never a centered hero control.
 */
export function RemoteHeaderRow({
  device,
  scale,
  isAway,
  editingName,
  nameInput,
  onChangeNameInput,
  onStartEdit,
  onCommitEdit,
  onBack,
  knownPower,
  hasSeparatePowerOnOff,
  disabled,
  onSend,
}: RemoteHeaderRowProps) {
  const hasPower = has(device, "power");
  const hasPowerOn = has(device, "powerOn");
  const hasPowerOff = has(device, "powerOff");
  const { size, font } = useRemoteScaled();
  const nameFont = { fontSize: font(theme.type.subtitle) };
  return (
    <View style={[styles.headerRow, { gap: size(theme.spacing.sm) }]}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to devices" hitSlop={BACK_HIT_SLOP}>
        <Ionicons name="chevron-back" size={size(BACK_ICON_SIZE)} color={theme.textPrimary} />
      </Pressable>
      <Text style={[styles.headerDivider, { fontSize: font(theme.type.title) }]}>|</Text>
      <View style={styles.headerText}>
        {editingName ? (
          <TextInput
            style={[styles.deviceNameInput, nameFont]}
            value={nameInput}
            onChangeText={onChangeNameInput}
            autoFocus
            selectTextOnFocus
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={onCommitEdit}
            onBlur={onCommitEdit}
          />
        ) : (
          <Pressable style={styles.deviceNameRow} onPress={onStartEdit} accessibilityRole="button" accessibilityLabel={`Rename ${device.name}`}>
            <Text style={[styles.deviceName, nameFont]} numberOfLines={1}>
              {device.name}
            </Text>
            <Ionicons name="pencil-outline" size={size(EDIT_ICON_SIZE)} color={theme.textTertiary} />
          </Pressable>
        )}
        <Text style={[styles.deviceMeta, { fontSize: font(theme.type.body), marginTop: size(theme.spacing.xs) }]} numberOfLines={1}>
          {device.manufacturer} {device.model}
          {isAway ? " · Remote" : ""}
        </Text>
      </View>
      {hasPower && (
        // ADR-HEARTH-133: Sony/Samsung's single "power" toggle falls back to Wake-on-LAN when the
        // TV can't be reached, so like powerOn below it must stay pressable while disconnected.
        <CapabilityButton shape="circle" scale={scale} icon="power" label="Power" variant="accent" onPress={() => onSend("power")} />
      )}
      {hasSeparatePowerOnOff && (
        // A device with real, separate powerOn/powerOff mechanisms (LG: Wake-on-LAN + SSAP) —
        // one button, same as every other TV's "power" toggle above. Defaults to powerOn when
        // state isn't known yet (a TV is more often reached for while off than on), otherwise
        // sends whichever command is the real opposite of the last known state.
        //
        // Real bug found live (2026-09-22): this used to always disable on controlsDisabled,
        // same as every other button — but powerOn (Wake-on-LAN) is specifically the ONE command
        // designed to work with no live connection at all (ADR-HEARTH-102's whole point is that
        // a fully-off TV has no SSAP socket to be "connected" through). That made the wake button
        // unpressable in exactly the state it exists to handle. Only gate on connection when the
        // next press would actually be powerOff, which is a real SSAP command over a live socket.
        <CapabilityButton
          shape="circle"
          scale={scale}
          icon={knownPower === "on" ? "power" : "power-outline"}
          label="Power"
          variant={knownPower === "on" ? "accent" : "ghost"}
          onPress={() => onSend(knownPower === "on" ? "powerOff" : "powerOn")}
          disabled={knownPower === "on" && disabled}
        />
      )}
      {!hasSeparatePowerOnOff && hasPowerOn && (
        // Same reasoning as the merged button above — a powerOn-only device (Xbox/PS5) is also
        // Wake-on-LAN, meant to work with no live connection at all. Never gated on controlsDisabled.
        <CapabilityButton shape="circle" scale={scale} icon="power" label="Power On" variant="accent" onPress={() => onSend("powerOn")} />
      )}
      {!hasSeparatePowerOnOff && hasPowerOff && (
        <CapabilityButton
          shape="circle"
          scale={scale}
          icon="power-outline"
          label="Power Off"
          variant="ghost"
          onPress={() => onSend("powerOff")}
          disabled={disabled}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm },
  headerDivider: { color: theme.border, fontSize: theme.type.title, fontWeight: "300" },
  // minWidth: 0 overrides Yoga's default min-content floor for a flex:1 item — same fix as
  // DeviceListScreen's header (2026-09-12): without it, a long/renamed device name can force
  // this box wider than the space left by the back chevron/divider/power buttons, overlapping
  // them instead of truncating.
  headerText: { flex: 1, minWidth: 0 },
  // Real-hardware finding (2026-09-12, live emulator test with a realistic long device name
  // "Downstairs Living Room"): headerText's own minWidth:0 above never actually constrained this
  // row, because deviceNameRow's `alignSelf: "flex-start"` opts it OUT of stretching to headerText's
  // bounded width in the first place — it sized to its own full content instead, so numberOfLines={1}
  // on deviceName never had a narrower box to truncate against, and the pencil icon got pushed into
  // the power button. minWidth: 0 here is the same New-Architecture Yoga fix as headerText's own
  // (a flex row child gets an implicit min-content floor unless told otherwise); alignSelf reverts to
  // the default "stretch" so this row is actually bounded by its parent's width.
  // Sean, directly (2026-09-12): "make the header font smaller" — theme.type.title (24) was sized
  // for DeviceListScreen's one-time "Hearth" wordmark, not a per-visit device name; subtitle (17)
  // reads clearly while leaving more width before truncation and less header height overall.
  deviceName: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "700", flexShrink: 1 },
  deviceNameRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, minWidth: 0 },
  deviceNameInput: {
    color: theme.textPrimary,
    fontSize: theme.type.subtitle,
    fontWeight: "700",
    borderBottomWidth: 1,
    borderBottomColor: theme.accentEnd,
    paddingVertical: theme.spacing.xs,
  },
  deviceMeta: { color: theme.textSecondary, fontSize: theme.type.body, marginTop: theme.spacing.xs },
});
