import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { Device } from "../core/types/Device";
import { Ps5Client } from "../drivers/gaming/ps5/Ps5Client";
import { PS5_DRIVER_ID } from "../drivers/gaming/ps5/Ps5Driver";
import { addDeviceFormStyles as styles } from "./addDeviceFormStyles";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface AddPs5DeviceScreenProps {
  driverRegistry: DriverRegistry;
  onCancel: () => void;
  onAdded: (device: Device) => void;
  initialIpAddress?: string;
}

type Stage = "idle" | "login" | "pin" | "saving" | "error";

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 20; // ~30s

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pairs a PS5 via Family Command Center's real PSN-login-based flow (Ps5Client.ts) — a real,
 * multi-step process the household member has to walk through interactively: open a real Sony
 * login link, paste back the resulting redirect URL, then enter a PIN from the console's own
 * screen. Nothing about the PSN password ever passes through this screen or Family Command
 * Center — that login happens entirely on Sony's own page.
 */
export function AddPs5DeviceScreen({ driverRegistry, onCancel, onAdded, initialIpAddress }: AddPs5DeviceScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("PS5");
  const [ipAddress, setIpAddress] = useState(initialIpAddress ?? "");
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loginUrl, setLoginUrl] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function pollUntil(target: "awaiting_pin" | "success"): Promise<void> {
    const client = new Ps5Client();
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);
      if (!sessionId) return;
      const status = await client.getLoginStatus(sessionId);
      if (status.status === target) return;
      if (status.status === "error") throw new Error(status.errorMessage || "Pairing failed on Family Command Center");
    }
    throw new Error("Timed out waiting for that step to complete — try again");
  }

  async function handleStartLogin() {
    if (ipAddress.trim().length === 0) {
      setStage("error");
      setErrorMessage("Enter the PS5's IP address first.");
      return;
    }
    setBusy(true);
    setErrorMessage("");
    try {
      const client = new Ps5Client();
      const result = await client.startLogin(ipAddress.trim());
      setSessionId(result.sessionId);
      setLoginUrl(result.loginUrl);
      setStage("login");
    } catch (err) {
      setStage("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenLoginLink() {
    try {
      await Linking.openURL(loginUrl);
    } catch {
      // Best-effort — the URL is also shown as plain text on screen for the household member to
      // copy manually if the system can't open it directly.
    }
  }

  async function handleSubmitRedirect() {
    if (!sessionId || redirectUrl.trim().length === 0) return;
    setBusy(true);
    setErrorMessage("");
    try {
      await new Ps5Client().submitRedirectUrl(sessionId, redirectUrl.trim());
      await pollUntil("awaiting_pin");
      setStage("pin");
    } catch (err) {
      setStage("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitPin() {
    if (!sessionId || pin.trim().length === 0) return;
    const driver = driverRegistry.get(PS5_DRIVER_ID);
    if (!driver) {
      setStage("error");
      setErrorMessage("PS5 driver is not registered in this build.");
      return;
    }
    setBusy(true);
    setErrorMessage("");
    try {
      await new Ps5Client().submitPin(sessionId, pin.trim());
      await pollUntil("success");
      setStage("saving");

      const device: Device = {
        id: `ps5-${Date.now()}`,
        name: name.trim() || "PS5",
        category: "gaming",
        manufacturer: "Sony",
        driverId: PS5_DRIVER_ID,
        capabilities: driver.getCapabilities(),
        config: { ipAddress: ipAddress.trim() },
      };
      await driver.connect(device);
      onAdded(device);
    } catch (err) {
      setStage("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <View style={styles.iconBadge}>
          <Ionicons name="game-controller-outline" size={20} color={theme.accentEnd} />
        </View>
        <Text style={styles.title}>Add PS5</Text>
      </View>

      {(stage === "idle" || stage === "error") && (
        <>
          <View style={styles.hintCard}>
            <Text style={styles.hint}>
              Power-on only. Pairing needs your real PlayStation Network sign-in (never seen by this app — it happens
              on Sony's own page) plus a PIN from the console itself.
            </Text>
          </View>
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="PS5" placeholderTextColor={theme.textTertiary} />
          <Text style={styles.label}>IP address</Text>
          <TextInput
            style={styles.input}
            value={ipAddress}
            onChangeText={setIpAddress}
            placeholder="192.168.1.214"
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
          {stage === "error" && (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
              <Text style={styles.error}>{errorMessage}</Text>
            </View>
          )}
          <View style={styles.row}>
            <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
            <CapabilityButton label={busy ? "Starting..." : "Pair"} variant="accent" onPress={handleStartLogin} disabled={busy} />
          </View>
        </>
      )}

      {stage === "login" && (
        <>
          <View style={styles.hintCard}>
            <Text style={styles.hint}>
              1. Tap below to open PlayStation's real sign-in page and log in with your own account.{"\n"}
              2. After signing in, the page will look blank or broken — that's expected.{"\n"}
              3. Copy the full URL from your browser's address bar and paste it below.
            </Text>
          </View>
          <CapabilityButton label="Open PlayStation Sign-In" variant="accent" onPress={handleOpenLoginLink} disabled={busy} />
          <Text style={[styles.hint, { marginTop: theme.spacing.sm }]} numberOfLines={2}>
            {loginUrl}
          </Text>
          <Text style={styles.label}>Paste the redirect URL here</Text>
          <TextInput
            style={styles.input}
            value={redirectUrl}
            onChangeText={setRedirectUrl}
            placeholder="https://remoteplay.dl.playstation.net/..."
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="none"
          />
          <View style={styles.row}>
            <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
            <CapabilityButton label={busy ? "Checking..." : "Continue"} variant="accent" onPress={handleSubmitRedirect} disabled={busy} />
          </View>
        </>
      )}

      {stage === "pin" && (
        <>
          <View style={styles.hintCard}>
            <Text style={styles.hint}>
              On the PS5: Settings → System → Remote Play → Link Device. Enter the 8-digit PIN it shows below.
            </Text>
          </View>
          <Text style={styles.label}>PIN</Text>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={setPin}
            placeholder="12345678"
            placeholderTextColor={theme.textTertiary}
            keyboardType="numbers-and-punctuation"
          />
          <View style={styles.row}>
            <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
            <CapabilityButton label={busy ? "Pairing..." : "Finish Pairing"} variant="accent" onPress={handleSubmitPin} disabled={busy} />
          </View>
        </>
      )}

      {stage === "saving" && <ActivityIndicator color={theme.accentEnd} style={styles.spinner} />}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
