import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { SnapshotImage } from "../../core/types/Snapshot";
import { FCC_CAMERA_DRIVER_ID, FccCameraDriver } from "../../drivers/camera/ring/FccCameraDriver";
import { CapabilityButton } from "../CapabilityButton";
import { formatCameraEventTime } from "../camera/formatCameraEventTime";
import { useFccCameraPoll } from "../camera/useFccCameraPoll";
import { theme } from "../theme";
import { EntityControlProps } from "./entityControlTypes";
import { entityControlStyles as shared } from "./entityControlStyles";

const IMAGE_HEIGHT = 220;

/** Ring `CameraView.availability` values that aren't the plain "online"/"offline" pair already
 * covered by EntityControlScreen's own connected/disconnected pill (ADR-HEARTH-191). */
const RING_AVAILABILITY_HINT: Record<string, string> = {
  ring_unavailable: "Ring reports this camera as unavailable.",
  auth_required: "Ring needs to be re-linked on the Family Command Center.",
};

/**
 * A camera entity's latest snapshot (ADR-HEARTH-182, extended for Family Command Center's Ring
 * cameras by ADR-HEARTH-191): fetched once when the screen opens and again only when the person
 * taps Refresh — never on a timer, so a camera in the household is never polled for imagery in the
 * background. Loaded through CommandEngine.fetchSnapshot, never a dispatched Command.
 *
 * For a Ring camera specifically, this also mount-scopes the 5-second `GET /api/cameras` refresh
 * (useFccCameraPoll.ts) so this one open screen's availability/battery/motion/ding fields stay
 * live, and shows them alongside the snapshot — a Home Assistant camera has none of these fields
 * and this section simply doesn't render for one.
 */
export function CameraControls({ device, state, disabled, fetchSnapshot, driverRegistry }: EntityControlProps) {
  const [image, setImage] = useState<SnapshotImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRingCamera = device.driverId === FCC_CAMERA_DRIVER_ID;
  const ringDriver = isRingCamera ? (driverRegistry.get(FCC_CAMERA_DRIVER_ID) as FccCameraDriver | undefined) : undefined;
  useFccCameraPoll(ringDriver);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await fetchSnapshot(device.id);
    setLoading(false);
    if (result.success && result.image) setImage(result.image);
    else setError(result.error ?? "Could not load the snapshot.");
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id]);

  const kind = typeof state.values.kind === "string" ? state.values.kind : undefined;
  const availability = typeof state.values.availability === "string" ? state.values.availability : undefined;
  const batteryLevel = typeof state.values.batteryLevel === "number" ? state.values.batteryLevel : null;
  const lastDingAt = typeof state.values.lastDingAt === "string" ? state.values.lastDingAt : null;
  const lastMotionAt = typeof state.values.lastMotionAt === "string" ? state.values.lastMotionAt : null;
  // A doorbell's ring matters more than its motion; anything else only ever reports motion.
  const lastEventLabel = kind === "doorbell" && lastDingAt ? `Last ring ${formatCameraEventTime(lastDingAt)}` : lastMotionAt ? `Last motion ${formatCameraEventTime(lastMotionAt)}` : null;
  const availabilityHint = availability ? RING_AVAILABILITY_HINT[availability] : undefined;
  // ADR-HEARTH-191: a camera with no snapshot yet is not an error — never fed to <Image/>, which
  // would just fail to load it a second time for no benefit.
  const showPlaceholder = image?.placeholder === true;

  return (
    <View style={shared.card}>
      <Text style={shared.cardLabel}>Snapshot</Text>
      {image && !showPlaceholder && <Image accessibilityLabel={`${device.name} snapshot`} source={image} style={styles.image} resizeMode="cover" />}
      {showPlaceholder && (
        <View style={[styles.image, styles.placeholder]}>
          <Ionicons name={kind === "doorbell" ? "videocam-outline" : "camera-outline"} size={32} color={theme.textTertiary} />
          <Text style={styles.placeholderLabel}>No snapshot yet</Text>
        </View>
      )}
      {loading && <ActivityIndicator color={theme.accentEnd} />}
      {error && !loading && <Text style={shared.hint}>{error}</Text>}
      <CapabilityButton icon="refresh" label="Refresh" onPress={() => void load()} disabled={disabled || loading} />

      {isRingCamera && (kind || batteryLevel !== null || lastEventLabel) && (
        <View style={styles.metaRow}>
          {kind && <Text style={styles.metaText}>{kind === "doorbell" ? "Doorbell" : "Camera"}</Text>}
          {batteryLevel !== null && <Text style={styles.metaText}>Battery {batteryLevel}%</Text>}
          {lastEventLabel && <Text style={styles.metaText}>{lastEventLabel}</Text>}
        </View>
      )}
      {isRingCamera && availabilityHint && <Text style={shared.hint}>{availabilityHint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", height: IMAGE_HEIGHT, borderRadius: theme.radius.md, backgroundColor: theme.surfaceRaised },
  placeholder: { alignItems: "center", justifyContent: "center", gap: theme.spacing.xs },
  placeholderLabel: { color: theme.textTertiary, fontSize: theme.type.caption },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md },
  metaText: { color: theme.textSecondary, fontSize: theme.type.caption },
});
