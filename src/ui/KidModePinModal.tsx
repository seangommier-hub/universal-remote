import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput } from "react-native";
import { isValidPin, PIN_LENGTH, sanitizePinInput } from "../core/kidMode/pinPolicy";
import { logger } from "../core/logging/logger";
import { KidPinVault } from "../runtime/kidPinVault";
import { actionModalStyles as modal } from "./actionModalStyles";
import { theme } from "./theme";

const LOG_SCOPE = "KidModePinModal";
const MS_PER_SECOND = 1000;

interface KidModePinModalProps {
  visible: boolean;
  /** "create" asks for a new PIN twice; "verify" checks the saved one. */
  mode: "create" | "verify";
  vault: KidPinVault;
  onSuccess: () => void;
  onCancel: () => void;
}

type Step = "enter" | "confirm" | "forgot";

/** The adult PIN prompt: sets a PIN the first time, checks it afterwards, and offers "Forgot PIN" via the household token. */
export function KidModePinModal({ visible, mode, vault, onSuccess, onCancel }: KidModePinModalProps) {
  const [step, setStep] = useState<Step>("enter");
  const [entry, setEntry] = useState("");
  const [firstEntry, setFirstEntry] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStep("enter");
    setEntry("");
    setFirstEntry("");
    setToken("");
    setMessage("");
    setBusy(false);
  }, [visible, mode]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      logger.warn(LOG_SCOPE, "PIN step failed", { error: String(error) });
      setMessage("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCreate() {
    if (step === "enter") {
      setFirstEntry(entry);
      setEntry("");
      setStep("confirm");
      setMessage("");
    } else if (entry !== firstEntry) {
      setStep("enter");
      setEntry("");
      setFirstEntry("");
      setMessage("Those didn't match. Start again.");
    } else {
      await vault.setPin(entry);
      onSuccess();
    }
  }

  async function submitVerify() {
    const result = await vault.verify(entry);
    setEntry("");
    if (result.ok) return onSuccess();
    if (result.reason === "locked") setMessage(`Too many tries. Wait ${Math.ceil((result.lockedForMs ?? 0) / MS_PER_SECOND)} seconds.`);
    else setMessage("That PIN isn't right.");
  }

  async function submitForgot() {
    if (await vault.resetWithHouseholdToken(token)) return onSuccess();
    setMessage("That token doesn't match this household.");
  }

  function submit() {
    if (step === "forgot") void run(submitForgot);
    else void run(mode === "create" ? submitCreate : submitVerify);
  }

  const canSubmit = !busy && (step === "forgot" ? token.trim().length > 0 : isValidPin(entry));
  const title = step === "forgot" ? "Forgot PIN" : mode === "create" ? (step === "enter" ? "Choose a grown-up PIN" : "Enter it again") : "Grown-up PIN";
  const help =
    step === "forgot"
      ? "Paste this household's Family Command Center token to clear the PIN and leave kid mode. You can also reinstall Hearth."
      : mode === "create"
        ? `${PIN_LENGTH} digits. You'll need it to leave kid mode.`
        : "Enter the PIN to leave kid mode.";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* accessible={false} on both wrapping Pressables (ADR-HEARTH-180): a Pressable defaults to
          accessible=true, which collapses every descendant into ONE opaque VoiceOver/TalkBack node
          — without this, the PIN field, Next/Unlock button and Cancel link inside would never be
          individually reachable by a screen reader, only the whole modal as one unlabeled blob. */}
      <Pressable style={modal.backdrop} onPress={onCancel} accessible={false}>
        <Pressable style={modal.card} onPress={(e) => e.stopPropagation()} accessible={false}>
          <Text style={modal.title}>{title}</Text>
          <Text style={styles.help}>{help}</Text>
          {step === "forgot" ? (
            <TextInput style={styles.input} value={token} onChangeText={setToken} placeholder="Household token" placeholderTextColor={theme.textTertiary} autoCapitalize="none" secureTextEntry accessibilityLabel="Household token" onSubmitEditing={submit} />
          ) : (
            <TextInput
              style={[styles.input, styles.pinInput]}
              value={entry}
              onChangeText={(text) => setEntry(sanitizePinInput(text))}
              placeholder="••••"
              placeholderTextColor={theme.textTertiary}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={PIN_LENGTH}
              autoFocus
              accessibilityLabel="PIN"
              onSubmitEditing={submit}
            />
          )}
          {message !== "" && <Text style={styles.message}>{message}</Text>}
          <Pressable style={({ pressed }) => [modal.option, pressed && canSubmit && modal.optionPressed]} onPress={canSubmit ? submit : undefined} accessibilityRole="button" accessibilityState={{ disabled: !canSubmit }}>
            <Text style={canSubmit ? modal.optionLabel : modal.optionDisabledLabel}>{step === "forgot" ? "Clear PIN" : mode === "create" ? (step === "enter" ? "Next" : "Save PIN") : "Unlock"}</Text>
          </Pressable>
          {mode === "verify" && step !== "forgot" && (
            <Pressable style={modal.option} onPress={() => { setStep("forgot"); setMessage(""); }} accessibilityRole="button">
              <Text style={modal.optionLabel}>Forgot PIN</Text>
            </Pressable>
          )}
          <Pressable style={modal.cancel} onPress={onCancel}>
            <Text style={modal.cancelLabel}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  help: { color: theme.textSecondary, fontSize: theme.type.label, lineHeight: 18 },
  input: {
    color: theme.textPrimary,
    fontSize: theme.type.body,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  pinInput: { textAlign: "center", fontSize: theme.type.title, letterSpacing: 8 },
  message: { color: theme.statusError, fontSize: theme.type.label },
});
