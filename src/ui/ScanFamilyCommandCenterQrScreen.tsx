import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { verifyAndSaveFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface ScanFamilyCommandCenterQrScreenProps {
  onCancel: () => void;
  onSaved: () => void;
  onUseManualEntry: () => void;
}

type ScanStatus = "scanning" | "verifying" | "error";

function parsePairingPayload(raw: string): { baseUrl: string; token: string } | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.baseUrl === "string" && typeof parsed.token === "string") {
      return { baseUrl: parsed.baseUrl, token: parsed.token };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Scans the QR code Family Command Center's own Settings screen shows (JSON: {baseUrl, token})
 * and feeds it into the same verify-before-save flow the manual entry form uses — this is the
 * primary pairing path per ADR-HEARTH-011's update, since typing a long token by hand is bad UX
 * for a non-technical household member. Manual entry stays available as a fallback.
 */
export function ScanFamilyCommandCenterQrScreen({ onCancel, onSaved, onUseManualEntry }: ScanFamilyCommandCenterQrScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<ScanStatus>("scanning");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleScanned(data: string) {
    if (status !== "scanning") return; // ignore repeat scans while we're already verifying/erroring

    const payload = parsePairingPayload(data);
    if (!payload) {
      setStatus("error");
      setErrorMessage("That QR code isn't a Family Command Center pairing code.");
      return;
    }

    setStatus("verifying");
    try {
      await verifyAndSaveFamilyCommandCenterConfig(payload.baseUrl, payload.token);
      onSaved();
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.accentEnd} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Ionicons name="camera-outline" size={40} color={theme.textTertiary} />
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>Hearth needs the camera to scan the pairing QR code.</Text>
        <View style={styles.row}>
          <CapabilityButton label="Cancel" variant="ghost" onPress={onCancel} />
          <CapabilityButton label="Allow Camera" variant="accent" onPress={requestPermission} />
        </View>
        <Pressable onPress={onUseManualEntry}>
          <Text style={styles.manualLink}>Enter address and token manually instead</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={(result) => handleScanned(result.data)}
      />

      <View style={styles.overlay}>
        <View style={styles.headerRow}>
          <CapabilityButton icon="chevron-back" label="Cancel" variant="ghost" onPress={onCancel} />
        </View>

        <View style={styles.frame} />

        <View style={styles.footer}>
          {status === "scanning" && <Text style={styles.hint}>Point the camera at Family Command Center's pairing QR code</Text>}
          {status === "verifying" && (
            <View style={styles.row}>
              <ActivityIndicator color={theme.accentEnd} />
              <Text style={styles.hint}>Verifying...</Text>
            </View>
          )}
          {status === "error" && (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle-outline" size={16} color={theme.statusError} />
              <Text style={styles.error}>{errorMessage}</Text>
              <CapabilityButton label="Try again" variant="accent" onPress={() => setStatus("scanning")} />
            </View>
          )}
          <Pressable onPress={onUseManualEntry}>
            <Text style={styles.manualLink}>Enter manually instead</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
    backgroundColor: theme.background,
    paddingHorizontal: theme.spacing.xl,
  },
  permissionTitle: { color: theme.textPrimary, fontSize: theme.type.subtitle, fontWeight: "600" },
  permissionBody: { color: theme.textSecondary, fontSize: theme.type.label, textAlign: "center" },
  overlay: { flex: 1, justifyContent: "space-between", backgroundColor: "rgba(0,0,0,0.15)" },
  headerRow: { paddingTop: 56, paddingHorizontal: theme.spacing.lg },
  frame: {
    alignSelf: "center",
    width: 220,
    height: 220,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    borderColor: theme.accentEnd,
  },
  footer: { padding: theme.spacing.xl, gap: theme.spacing.md, alignItems: "center" },
  hint: { color: theme.textPrimary, fontSize: theme.type.body, textAlign: "center" },
  row: { flexDirection: "row", gap: theme.spacing.md, alignItems: "center" },
  errorCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    alignItems: "center",
  },
  error: { color: theme.statusError, fontSize: theme.type.label, textAlign: "center" },
  manualLink: { color: theme.textSecondary, fontSize: theme.type.label, textDecorationLine: "underline" },
});
