import { StyleSheet, Text, TextInput, View } from "react-native";
import { CapabilityButton } from "./CapabilityButton";
import { remoteCardStyles } from "./remoteCardStyles";
import { useRemoteScaled } from "./RemoteScaleContext";
import { theme } from "./theme";

const KEYBOARD_HINT_LINE_HEIGHT = 18;

interface KeyboardCardProps {
  value: string;
  disabled: boolean;
  onChangeValue: (text: string) => void;
  onSubmit: () => void;
}

/** The remote screen's "Keyboard" tab — types on the phone's own keyboard and sends textEntry to the TV. */
export function KeyboardCard({ value, disabled, onChangeValue, onSubmit }: KeyboardCardProps) {
  const { size, font } = useRemoteScaled();
  return (
    <View style={[remoteCardStyles.card, { padding: size(theme.spacing.md), gap: size(theme.spacing.sm), borderRadius: size(theme.radius.lg) }]}>
      <Text style={[remoteCardStyles.cardLabel, { fontSize: font(theme.type.label) }]}>Type on the TV</Text>
      <View style={[styles.keyboardHintCard, { padding: size(theme.spacing.md), marginBottom: size(theme.spacing.sm), borderRadius: size(theme.radius.md) }]}>
        <Text style={[styles.keyboardHint, { fontSize: font(theme.type.label), lineHeight: font(KEYBOARD_HINT_LINE_HEIGHT) }]}>
          Type using your phone's own keyboard, then tap Send to type it on the TV — no more navigating letter by letter with
          the d-pad. Use the Remote tab's Select button to move to the next field or submit.
        </Text>
      </View>
      <TextInput
        style={[
          styles.keyboardInput,
          {
            fontSize: font(theme.type.body),
            paddingVertical: size(theme.spacing.md),
            paddingHorizontal: size(theme.spacing.lg),
            marginBottom: size(theme.spacing.md),
            borderRadius: size(theme.radius.md),
          },
        ]}
        value={value}
        onChangeText={onChangeValue}
        placeholder="Type a username, password, or search term…"
        placeholderTextColor={theme.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        onSubmitEditing={onSubmit}
        returnKeyType="send"
      />
      {/* Real-device finding (2026-09-10, this codebase's own established pattern — see the
          Reconnect button in UniversalTvRemote.tsx): CapabilityButton never shows both an icon
          and a visible label together, so an icon+label pill button silently renders as a bare
          glyph with no visible text at all. No icon here, matching every other named pill action. */}
      <CapabilityButton label="Send" variant="accent" onPress={onSubmit} disabled={disabled || value.length === 0} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches addDeviceFormStyles.ts's hintCard/hint pattern (the app's established look for
  // neutral informational copy, used across every Add*DeviceScreen) rather than plain floating
  // text — real-device ask (2026-09-16): "make sure the visual is consistent with the rest of
  // the app." Same token choices this file already uses for a "raised" element against a
  // theme.surface card (see CapabilityButton's own default button background) plus borderSubtle,
  // matching that reference pattern's own weight for a non-error callout.
  keyboardHintCard: {
    backgroundColor: theme.surfaceRaised,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  keyboardHint: { color: theme.textSecondary, fontSize: theme.type.label, lineHeight: 18 },
  keyboardInput: {
    color: theme.textPrimary,
    fontSize: theme.type.body,
    backgroundColor: theme.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
});
