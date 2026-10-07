import { StyleSheet, View } from "react-native";
import { CapabilityId } from "../core/types/Capability";
import { Device } from "../core/types/Device";
import { CapabilityButton } from "./CapabilityButton";
import { has } from "./hasCapability";
import { remoteCardStyles } from "./remoteCardStyles";
import { theme } from "./theme";
import { CallCommandCenterStatus } from "./useCallCommandCenterButton";
import { UtilityAction } from "./UtilityAction";

interface UtilityActionsRowProps {
  device: Device;
  scale: number;
  /** ADR-HEARTH-216: the live overflow-correction factor (useRemoteFitScale) -- applied to this
   * card's own padding/gap directly, and passed through to each UtilityAction below as a true
   * last resort (its own circle size only actually shrinks once the hub and every card's padding
   * have already hit fitScale.ts's own floor and the screen still doesn't fit). These buttons
   * ship today at `size="sm"` (52px, ADR-HEARTH-134) with real room above the 32px "xs" size
   * ADR-HEARTH-121 already shipped on this exact row -- shrinking toward, not below, an already-
   * shipped size on a genuinely tight device (e.g. iPhone SE's 667pt height) is a real, bounded
   * tradeoff, not the "control nobody can tap" failure this feature's own task warned against. */
  fitScale: number;
  columns: number;
  disabled: boolean;
  muted: boolean;
  hasNativeSleepTimer: boolean;
  canUniversalSleep: boolean;
  sleepActive: boolean;
  onSend: (capability: CapabilityId) => void;
  onOpenSleepPicker: () => void;
  onOpenBrowse: () => void;
  /** ADR-HEARTH-215: opens the touchpad (drag-to-move, tap-to-click real pointer control) --
   * gated on the device declaring pointerMove, same as every other capability-specific button in
   * this row (unlike the Call Command Center button below, this one IS device-specific). */
  onOpenTouchpad: () => void;
  /** ADR-HEARTH-213: always available, on every TV's remote screen, unlike every other button in
   * this row -- not gated on the device's own capabilities, since this calls Family Command
   * Center itself, not the TV. */
  commandCenterStatus: CallCommandCenterStatus;
  onCallCommandCenter: () => void;
}

const COMMAND_CENTER_DISPLAY: Record<CallCommandCenterStatus, { icon: "call-outline" | "checkmark-circle" | "close-circle"; label: string }> = {
  // "Call Center" read as the unrelated customer-service kind (Sean, directly, 2026-10-07) -- this
  // is a noun (the destination), matching every other button in this row (Home, Menu, Mute,
  // Settings), not a verb phrase.
  idle: { icon: "call-outline", label: "Command Center" },
  checking: { icon: "call-outline", label: "Calling…" },
  reached: { icon: "checkmark-circle", label: "Reached" },
  unreachable: { icon: "close-circle", label: "No Answer" },
};

// Sean's reference (2026-09-10): mute/back/home/menu read as one row of icon-over-caption
// chips — a physical remote's secondary buttons, small and labeled below rather than
// competing with the hub above for attention. Real-device ask (2026-09-10): "that card
// needs better spacing" — gap widened from spacing.md to spacing.lg and the card's own
// padding from spacing.lg to spacing.xl for more breathing room between and around these
// buttons than the denser hub/input cards need.
/** The remote screen's Home/Menu/Mute/Back/Settings/Sleep/Source/Browse utility row card. */
export function UtilityActionsRow({
  device,
  scale,
  fitScale,
  columns,
  disabled,
  muted,
  hasNativeSleepTimer,
  canUniversalSleep,
  sleepActive,
  onSend,
  onOpenSleepPicker,
  onOpenBrowse,
  onOpenTouchpad,
  commandCenterStatus,
  onCallCommandCenter,
}: UtilityActionsRowProps) {
  const commandCenterDisplay = COMMAND_CENTER_DISPLAY[commandCenterStatus];
  return (
    <View style={[remoteCardStyles.card, styles.utilityCard, { paddingVertical: theme.spacing.md * fitScale }]}>
      {/* Real-device ask (2026-09-11): "the order should be Home, Menu, Mute, Back." */}
      <View style={[styles.utilityRow, { rowGap: theme.spacing.lg * fitScale }]}>
        {has(device, "home") && <UtilityAction columns={columns} scale={scale} fitScale={fitScale} icon="home-outline" label="Home" onPress={() => onSend("home")} disabled={disabled} />}
        {has(device, "menu") && <UtilityAction columns={columns} scale={scale} fitScale={fitScale} icon="menu-outline" label="Menu" onPress={() => onSend("menu")} disabled={disabled} />}
        {has(device, "mute") && (
          <UtilityAction
            columns={columns}
            scale={scale}
            fitScale={fitScale}
            icon={muted ? "volume-mute" : "volume-medium-outline"}
            label={muted ? "Unmute" : "Mute"}
            active={muted}
            onPress={() => onSend("mute")}
            disabled={disabled}
          />
        )}
        {has(device, "back") && <UtilityAction columns={columns} scale={scale} fitScale={fitScale} icon="arrow-back-outline" label="Back" onPress={() => onSend("back")} disabled={disabled} />}
        {/* Real-hardware ask (2026-09-10): "settings and sleep timer should be next to
            eachother" — Samsung only; verified real KEY_TOOLS/KEY_SLEEP codes exist for this
            protocol specifically (see Capability.ts). LG/Roku don't declare these capabilities
            because their own public APIs genuinely have no equivalent — not omitted by
            oversight. */}
        {has(device, "settings") && <UtilityAction columns={columns} scale={scale} fitScale={fitScale} icon="settings-outline" label="Settings" onPress={() => onSend("settings")} disabled={disabled} />}
        {hasNativeSleepTimer && <UtilityAction columns={columns} scale={scale} fitScale={fitScale} icon="moon-outline" label="Sleep" onPress={() => onSend("sleepTimer")} disabled={disabled} />}
        {canUniversalSleep && (
          <UtilityAction
            columns={columns}
            scale={scale}
            fitScale={fitScale}
            icon={sleepActive ? "moon" : "moon-outline"}
            label="Sleep"
            active={sleepActive}
            onPress={onOpenSleepPicker}
            disabled={disabled}
          />
        )}
        {/* Real-hardware research (2026-09-10): Samsung's KEY_SOURCE opens the TV's own
            on-screen source picker rather than jumping to a named input directly — a
            genuinely different mechanism from inputSelection, not the same feature under a
            different name (see ADR-HEARTH-027 and Capability.ts). The user drives the opened
            picker with the d-pad/select this driver already has. */}
        {has(device, "openSourceList") && (
          <UtilityAction columns={columns} scale={scale} fitScale={fitScale} icon="tv-outline" label="Source" onPress={() => onSend("openSourceList")} disabled={disabled} />
        )}
        {/* ADR-HEARTH-182: media_player browse_media — its own full-screen modal, opened here rather than folded into this row's send()s since browsing is a read, not a dispatched Command. */}
        {has(device, "browseMedia") && (
          <UtilityAction columns={columns} scale={scale} fitScale={fitScale} icon="folder-outline" label="Browse" onPress={onOpenBrowse} disabled={disabled} />
        )}
        {/* ADR-HEARTH-215: real pointer control (drag-to-move, tap-to-click), for content that
            expects a mouse rather than the d-pad's focus-based navigation -- e.g. Family Command
            Center's own dashboard, shown in the LG's built-in browser. */}
        {has(device, "pointerMove") && (
          <UtilityAction columns={columns} scale={scale} fitScale={fitScale} icon="hand-left-outline" label="Touchpad" onPress={onOpenTouchpad} disabled={disabled} />
        )}
      </View>
      {/* ADR-HEARTH-213/216: Sean, directly (2026-10-07) -- "make command center it's own button
          full width below those buttons," out of the icon-chip grid above (unconditional, every
          TV, regardless of capabilities, since this calls Family Command Center itself, not the
          TV). Never disabled by `disabled` (controlsDisabled reflects the TV's own connection, not
          FCC's) -- the whole point is to work when nothing else on this screen does. */}
      <CapabilityButton
        label={commandCenterDisplay.label}
        icon={commandCenterDisplay.icon}
        variant={commandCenterStatus === "reached" || commandCenterStatus === "unreachable" ? "accent" : "default"}
        onPress={onCallCommandCenter}
        disabled={commandCenterStatus === "checking"}
        containerStyle={[styles.commandCenterButton, { marginTop: theme.spacing.lg * fitScale }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  utilityCard: { paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  // Sean, directly (2026-09-21, ADR-HEARTH-121): "reduce the button size to make the bottom card
  // one row." Previously this row wrapped by design once a device's set grew past ~4 items (see
  // git history for the full prior arithmetic) — Samsung's real 7-item case (home/menu/mute/back/
  // settings/sleep/source) is the actual worst case now designed for. At the new xs circle size
  // (36px item width, ADR-HEARTH-121) and a tightened spacing.xs (4px) gap: 7×36 + 6×4 = 276px,
  // against this card's ~295px available content width (375 baseline − 32px outer content
  // padding − 48px utilityCard's own padding) — 19px of margin, deliberately generous given this
  // exact row's history of underestimated arithmetic (reported broken three times before this).
  // flexWrap/rowGap stay in place as a defensive fallback only — not expected to trigger for any
  // current driver's capability set, but a future driver adding an 8th+ item degrades to a second
  // line instead of clipping off-card.
  utilityRow: { flexDirection: "row", flexWrap: "wrap", rowGap: theme.spacing.lg, alignItems: "flex-start", justifyContent: "center" },
  // ADR-HEARTH-216: full width, its own row below the icon-chip grid -- a destination
  // (Command Center) reads differently from this card's TV-control buttons, so it's styled as a
  // normal pill button (icon + label inline) rather than another small icon-over-caption chip.
  commandCenterButton: { width: "100%", marginTop: theme.spacing.lg },
});
