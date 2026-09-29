import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { converse } from "../drivers/homeAssistant/haAssist";
import { getHaInstance } from "../drivers/homeAssistant/haInstanceRegistry";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface HomeAssistantAssistScreenProps {
  instanceId: string;
  onBack: () => void;
}

interface Exchange {
  question: string;
  answer: string;
  ok: boolean;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * A plain text box and response bubble for Home Assistant's Assist (ADR-HEARTH-183), reached from the
 * Home Assistant device list. Posts to /api/conversation/process over the same per-instance
 * credential every other Home Assistant request uses (ADR-HEARTH-175) and shows
 * response.speech.plain.speech; a server too old for Assist says so instead of failing silently.
 */
export function HomeAssistantAssistScreen({ instanceId, onBack }: HomeAssistantAssistScreenProps) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [history, setHistory] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);

  async function send() {
    const question = text.trim();
    if (!question || busy) return;
    const instance = getHaInstance(instanceId);
    setText("");
    if (!instance) {
      setHistory((current) => [...current, { question, answer: "This Home Assistant server isn't connected on this phone.", ok: false }]);
      return;
    }
    setBusy(true);
    try {
      const result = await converse(instance, question, conversationId);
      setConversationId(result.conversationId);
      setHistory((current) => [...current, { question, answer: result.speech, ok: true }]);
    } catch (err) {
      setHistory((current) => [...current, { question, answer: messageOf(err), ok: false }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg, flexGrow: 1 }]}>
        <Text style={styles.title}>Ask Home Assistant</Text>
        {history.length === 0 && !busy && <Text style={assistStyles.empty}>Ask it anything your Home Assistant's Assist agent understands.</Text>}
        {history.map((exchange, index) => (
          <View key={index} style={assistStyles.exchange}>
            <Text style={assistStyles.question}>{exchange.question}</Text>
            <Text style={[assistStyles.answer, !exchange.ok && assistStyles.answerError]}>{exchange.answer}</Text>
          </View>
        ))}
        {busy && <ActivityIndicator color={theme.accentEnd} />}
      </ScrollView>
      <View style={assistStyles.inputRow}>
        {/* ADR-HEARTH-200: deliberately the plain OS TextInput, not ThemedKeyboard.tsx (the custom
            on-screen keyboard ADR-HEARTH-025 built for AddSonyDeviceScreen's PSK field) -- no
            keyboardType/secureTextEntry/showSoftInputOnFocus here either, so iOS keeps showing its
            own keyboard's built-in dictation mic for this field with no extra code. Don't add any
            of those props here without re-checking dictation still works; a numeric keyboardType
            or a custom keyboard would take that mic away. */}
        <TextInput
          style={[styles.input, assistStyles.textInput]}
          value={text}
          onChangeText={setText}
          placeholder="Turn off the kitchen lights"
          placeholderTextColor={theme.textTertiary}
          onSubmitEditing={() => void send()}
          returnKeyType="send"
        />
        <CapabilityButton label="Send" variant="accent" onPress={() => void send()} disabled={busy || text.trim().length === 0} />
      </View>
      <View style={assistStyles.backRow}>
        <CapabilityButton label="Back" variant="ghost" onPress={onBack} />
      </View>
    </KeyboardAvoidingView>
  );
}

const assistStyles = {
  empty: { color: theme.textTertiary, fontSize: theme.type.label },
  exchange: { marginBottom: theme.spacing.md, gap: theme.spacing.xs },
  question: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "700" as const, alignSelf: "flex-end" as const },
  answer: {
    color: theme.textSecondary,
    fontSize: theme.type.body,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
  },
  answerError: { color: theme.statusError },
  inputRow: { flexDirection: "row" as const, gap: theme.spacing.sm, paddingHorizontal: theme.spacing.xl, alignItems: "center" as const },
  textInput: { flex: 1 },
  backRow: { paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.sm },
};
