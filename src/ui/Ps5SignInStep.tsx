import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { describeRedirectProblem, extractPs5RedirectUrl } from "../discovery/ps5Redirect";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

// ADR-HEARTH-155: the PS5 sign-in step, cut to one button and one paste box. The numbered steps
// name the exact thing to do on the blank redirect page; a pasted address containing `code=` is
// recognised on its own and sent on without another tap.

const MIN_TEXT_LENGTH_TO_JUDGE = 12;

const SIGN_IN_STEPS = [
  'Tap "Sign in with PlayStation" and sign in with your own PlayStation account.',
  "After you sign in, the page will look blank or show an error. That is expected.",
  "Copy the whole address at the top of that page (tap the address bar, then Copy, or use Share > Copy).",
  "Close the browser, then paste the address in the box below. Hearth continues by itself.",
];

interface Ps5SignInStepProps {
  onOpenSignIn: () => void;
  onRedirectFound: (redirectUrl: string) => void;
  onCancel: () => void;
  disabled: boolean;
}

/** Numbered sign-in steps, a re-open button and one paste box that submits itself once it sees a sign-in address. */
export function Ps5SignInStep({ onOpenSignIn, onRedirectFound, onCancel, disabled }: Ps5SignInStepProps) {
  const [pasted, setPasted] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function handleChange(text: string) {
    setPasted(text);
    const result = extractPs5RedirectUrl(text);
    if (result.kind === "ok") {
      setProblem(null);
      onRedirectFound(result.redirectUrl);
      return;
    }
    setProblem(text.trim().length >= MIN_TEXT_LENGTH_TO_JUDGE ? describeRedirectProblem(result) : null);
  }

  return (
    <>
      <View style={styles.hintCard}>
        {SIGN_IN_STEPS.map((step, index) => (
          <Text key={step} style={styles.hint}>
            {index + 1}. {step}
          </Text>
        ))}
      </View>
      <CapabilityButton label="Sign in with PlayStation" variant="accent" onPress={onOpenSignIn} disabled={disabled} />
      <Text style={styles.label}>Paste the address here</Text>
      <TextInput
        style={[styles.input, { minHeight: 96, textAlignVertical: "top" }]}
        value={pasted}
        onChangeText={handleChange}
        placeholder="Touch and hold here, then choose Paste"
        placeholderTextColor={theme.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        editable={!disabled}
        accessibilityLabel="Paste the PlayStation sign-in address"
      />
      {problem && (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
          <Text style={styles.error}>{problem}</Text>
        </View>
      )}
      <View style={styles.row}>
        <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </>
  );
}
