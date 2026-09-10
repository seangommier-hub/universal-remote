import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { verifyAndSaveFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import { logger } from "../core/logging/logger";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

const LOG_SCOPE = "ScanFamilyCommandCenterQrScreen";

interface ScanFamilyCommandCenterQrScreenProps {
  onCancel: () => void;
  onSaved: () => void;
  onUseManualEntry: () => void;
}

type ScanStatus = "scanning" | "verifying" | "error";

const FRAME_SIZE = 240;

/** Sweeps a highlight bar top-to-bottom inside the scan frame, looping while status is "scanning" — the same "actively looking" affordance most camera-based scanners use, so the frame reads as alive rather than a static decorative box. */
function useScanLineAnimation(active: boolean) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, progress]);

  return progress.interpolate({ inputRange: [0, 1], outputRange: [8, FRAME_SIZE - 8] });
}

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
  const scanLineTranslateY = useScanLineAnimation(status === "scanning");

  async function handleScanned(data: string) {
    if (status !== "scanning") return; // ignore repeat scans while we're already verifying/erroring

    const payload = parsePairingPayload(data);
    if (!payload) {
      // Never log `data` itself here — if this *is* a valid pairing payload that merely failed a
      // type check for some other reason, that string still contains the token.
      logger.debug(LOG_SCOPE, "Scanned QR did not parse as a pairing payload", { rawLength: data.length });
      setStatus("error");
      setErrorMessage("That QR code isn't a Family Command Center pairing code.");
      return;
    }

    // Deliberately logs only baseUrl, never payload.token — this is the exact value being
    // diagnosed for the "fetch failed" investigation (ADR-HEARTH-010's baseUrl-mismatch bug).
    logger.debug(LOG_SCOPE, "Parsed pairing payload from QR, verifying", { baseUrl: payload.baseUrl });

    setStatus("verifying");
    try {
      await verifyAndSaveFamilyCommandCenterConfig(payload.baseUrl, payload.token);
      logger.info(LOG_SCOPE, "Family Command Center pairing verified and saved", { baseUrl: payload.baseUrl });
      onSaved();
    } catch (err) {
      logger.warn(LOG_SCOPE, "Family Command Center pairing verification failed", {
        baseUrl: payload.baseUrl,
        message: err instanceof Error ? err.message : String(err),
      });
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
          <CapabilityButton icon="chevron-back" label="Cancel" variant="ghost" onPress={onCancel} containerStyle={styles.cancelButton} />
        </View>

        <View style={styles.frameWrap}>
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
          {status === "scanning" && (
            <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineTranslateY }] }]} />
          )}
        </View>

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
  overlay: { flex: 1, justifyContent: "space-between", backgroundColor: "rgba(0,0,0,0.4)" },
  headerRow: { paddingTop: 56, paddingHorizontal: theme.spacing.lg },
  // The default ghost-button border (theme.border, a subtle navy) is tuned for the app's own
  // dark surfaces — over an unpredictable live camera feed it can read as a stray dark smudge
  // instead of a button. A translucent-black pill with a visible white border stays legible
  // against any camera content, same principle every camera app's own overlay controls use.
  cancelButton: {
    backgroundColor: "rgba(0,0,0,0.45)",
    borderColor: "rgba(255,255,255,0.6)",
  },
  frameWrap: {
    alignSelf: "center",
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    overflow: "hidden",
  },
  corner: {
    position: "absolute",
    width: 36,
    height: 36,
    borderColor: theme.accentEnd,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: theme.radius.md,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: theme.radius.md,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: theme.radius.md,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: theme.radius.md,
  },
  scanLine: {
    position: "absolute",
    left: 8,
    right: 8,
    height: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.accentEnd,
    shadowColor: theme.accentEnd,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
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
