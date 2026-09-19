import { useEffect, useState } from "react";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";

interface NowPlaying {
  device: Device;
  title: string;
}

/** Resolves a title for a device that's playing/paused right now — prefers the driver's own
 * real, live active-app name (Roku's `activeAppName`, ADR-HEARTH-093) when available, falls back
 * to resolving the last-launched app id against the device's installed-app catalog (both
 * populated by ADR-HEARTH-076/078/085), and finally a generic label rather than showing nothing.
 * Never fabricates a real title/artwork this app's protocols don't actually expose. */
export function resolveTitle(values: Record<string, unknown>): string {
  if (typeof values.activeAppName === "string" && values.activeAppName.trim()) return values.activeAppName;
  const lastLaunchedAppId = values.lastLaunchedAppId;
  const apps = values.apps;
  if (typeof lastLaunchedAppId === "string" && Array.isArray(apps)) {
    const match = apps.find((app): app is { id: string; name: string } => typeof app === "object" && app !== null && (app as { id?: unknown }).id === lastLaunchedAppId);
    if (match?.name) return match.name;
  }
  return "Now Playing";
}

/**
 * Picks a single device to show in the home screen's now-playing widget (ADR-HEARTH-093) —
 * deliberately one at a time, per Sean's own explicit scoping, not a widget per playing device.
 * Prefers a device that's actively "playing" over one merely "paused" (matching Apple Music's own
 * mini-player behavior of always surfacing something actionable first); picks the first match
 * found when more than one qualifies, since there's no other signal to break the tie by.
 */
export function useNowPlaying(devices: Device[], stateStore: StateStore): NowPlaying | null {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);

  useEffect(() => {
    function recompute() {
      const playing = devices.find((d) => stateStore.get(d.id).values.playbackState === "playing");
      const paused = devices.find((d) => stateStore.get(d.id).values.playbackState === "paused");
      const chosen = playing ?? paused;
      setNowPlaying(chosen ? { device: chosen, title: resolveTitle(stateStore.get(chosen.id).values) } : null);
    }

    recompute();
    const unsubscribes = devices.map((d) => stateStore.subscribe(d.id, recompute));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [devices, stateStore]);

  return nowPlaying;
}
