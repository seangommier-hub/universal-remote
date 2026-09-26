import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { joinHousehold } from "../discovery/joinHousehold";
import { normalizePairCode, PAIR_CODE_LENGTH, parsePairInput } from "../discovery/pairInvite";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { describePairFailure, PairFailureNotice } from "./describePairFailure";
import { NetworkFailureNotice } from "./NetworkFailureNotice";
import { theme } from "./theme";

const LINK_MARKER = "://";
const INCOMPLETE_CODE_MESSAGE = "Enter the 8-character code from your invite.";

interface JoinWithCodeScreenProps {
  onCancel: () => void;
  onJoined: () => void;
}

/** Keeps a typed code tidy (uppercase, no spaces or dashes) but leaves a pasted hearth:// link intact. */
function tidyInput(raw: string): string {
  return raw.includes(LINK_MARKER) ? raw.trim() : normalizePairCode(raw).slice(0, PAIR_CODE_LENGTH);
}

/** Lets a new household member type or paste an invite code (or link) instead of a 48-character token (ADR-HEARTH-149). */
export function JoinWithCodeScreen({ onCancel, onJoined }: JoinWithCodeScreenProps) {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<PairFailureNotice | null>(null);

  async function handleJoin() {
    const invite = parsePairInput(input);
    if (!invite) {
      setNotice({ message: INCOMPLETE_CODE_MESSAGE, diagnosis: null });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await joinHousehold(invite);
      onJoined();
    } catch (error) {
      setNotice(describePairFailure(error));
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <View style={styles.iconBadge}>
          <Ionicons name="key-outline" size={20} color={theme.accentEnd} />
        </View>
        <Text style={styles.title}>Join with a code</Text>
      </View>
      <View style={styles.hintCard}>
        <Text style={styles.hint}>Ask someone already using Hearth to tap Invite someone in Family Command Center settings, then enter the code they show you. You can also paste the invite link.</Text>
      </View>
      <TextInput
        style={[styles.input, { letterSpacing: 4, textAlign: "center", fontSize: theme.type.title }]}
        value={input}
        onChangeText={(text) => setInput(tidyInput(text))}
        placeholder="CODE"
        placeholderTextColor={theme.textTertiary}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {notice?.diagnosis && <NetworkFailureNotice diagnosis={notice.diagnosis} />}
      {notice?.message && (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
          <Text style={styles.error}>{notice.message}</Text>
        </View>
      )}
      <View style={styles.row}>
        <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
        <CapabilityButton label={busy ? "Joining..." : "Join"} variant="accent" onPress={handleJoin} disabled={busy || input.trim().length === 0} />
      </View>
      {busy && <ActivityIndicator color={theme.accentEnd} style={styles.spinner} />}
    </ScrollView>
  );
}
