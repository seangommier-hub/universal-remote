import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { SnapshotImage } from "../../core/types/Snapshot";
import { CapabilityButton } from "../CapabilityButton";
import { theme } from "../theme";
import { EntityControlProps } from "./entityControlTypes";
import { entityControlStyles as shared } from "./entityControlStyles";

const IMAGE_HEIGHT = 220;

/**
 * A camera entity's latest snapshot (ADR-HEARTH-182): fetched once when the screen opens and again only
 * when the person taps Refresh — never on a timer, so a camera in the household is never polled for
 * imagery in the background. Loaded through CommandEngine.fetchSnapshot, never a dispatched Command.
 */
export function CameraControls({ device, disabled, fetchSnapshot }: EntityControlProps) {
  const [image, setImage] = useState<SnapshotImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <View style={shared.card}>
      <Text style={shared.cardLabel}>Snapshot</Text>
      {image && <Image accessibilityLabel={`${device.name} snapshot`} source={image} style={styles.image} resizeMode="cover" />}
      {loading && <ActivityIndicator color={theme.accentEnd} />}
      {error && !loading && <Text style={shared.hint}>{error}</Text>}
      <CapabilityButton icon="refresh" label="Refresh" onPress={() => void load()} disabled={disabled || loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", height: IMAGE_HEIGHT, borderRadius: theme.radius.md, backgroundColor: theme.surfaceRaised },
});
