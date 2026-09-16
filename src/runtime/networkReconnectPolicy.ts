import { NetworkState } from "expo-network";

// Real-hardware/competitive research (2026-09-16): the single most common complaint across
// reviews of competing universal-remote apps is connection loss requiring a manual app restart —
// e.g. "The app loses its connection every time the phone goes to sleep... You have to either
// force quit the app and restart it" (a real app store review, see ADR-HEARTH-075). Sean's own
// standing ask (2026-09-09, ADR-HEARTH-017): "make sure that nothing ever gets unconnected
// like a device on wifi." App.tsx's existing AppState listener already reconnects every device the
// instant the app returns to the foreground from background/inactive — the one real gap that
// leaves is a network change that happens while the app STAYS in the foreground (the user is
// actively looking at the remote screen when Wi-Fi drops and comes back, or the phone hands off
// between Wi-Fi and cellular): nothing proactively notices until the user's next button press
// fails once and each driver's own reactive backoff loop (ADR-HEARTH-017) eventually kicks in.
//
// `expo-network`'s NetworkState has no SSID/network-identity field (Expo Go doesn't expose that —
// confirmed against expo-network's own SDK 57 source, packages/expo-network/src/Network.types.ts),
// so "the exact same Wi-Fi network, silently roamed to a different access point without ever
// reporting disconnected" can't be distinguished from "never changed at all." This policy covers
// what IS observable: (a) connectivity was lost and came back, and (b) the connection TYPE changed
// (e.g. Wi-Fi to cellular) even if isConnected never reported false in between. Real, meaningful
// improvement over "nothing proactive at all" — not a claim of perfect Wi-Fi-roam detection.

/**
 * True if transitioning from `previous` to `next` network state means every known device should
 * get a proactive reconnect attempt, mirroring the same "the moment connectivity is back, don't
 * wait for a timer" principle the AppState listener already applies to backgrounding. Pure and
 * directly unit-testable — the actual `expo-network` listener wiring lives in App.tsx, same split
 * as useDpadSwipeGesture.ts's tested predicates vs. its own PanResponder wiring.
 */
export function shouldReconnectOnNetworkChange(previous: NetworkState | null, next: NetworkState): boolean {
  if (previous === null) return false; // nothing to compare against yet — the very first reading, not a real transition
  const cameOnline = previous.isConnected === false && next.isConnected === true;
  const typeChangedWhileConnected = next.isConnected === true && previous.type !== undefined && previous.type !== next.type;
  return cameOnline || typeChangedWhileConnected;
}
