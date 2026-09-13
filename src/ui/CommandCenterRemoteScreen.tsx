import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, GestureResponderEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import { buildVncRelayUrl } from "../discovery/familyCommandCenterVncRelay";
import { RfbButton, RfbClient, RfbServerInfo } from "../drivers/inputRelay/vnc/RfbClient";
import { charToKeysym, Keysym } from "../drivers/inputRelay/vnc/keysym";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

interface CommandCenterRemoteScreenProps {
  onBack: () => void;
}

// A touchpad's own surface is much smaller than the Pi's real screen resolution, and a 1:1
// mapping would need huge swipes to cross it — this scales touch deltas up, the same way a
// laptop trackpad's pointer travels further than your finger does. Tuned by feel, not derived.
const TRACKPAD_SENSITIVITY = 2.2;
// A touch that moved less than this (in raw touch pixels, summed across the gesture) counts as a
// tap-to-click rather than a drag — real trackpads use the same "did it basically not move"
// heuristic to tell a click from an intentional (if tiny) drag.
const TAP_MOVEMENT_THRESHOLD = 8;
const CLICK_RELEASE_DELAY_MS = 60;

type ConnectionStatus = "connecting" | "connected" | "error";

const KEYBOARD_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

/**
 * Turns the phone into an input device for the Family Command Center's own machine — a trackpad
 * (drag to move the cursor, tap to click) plus an on-screen keyboard, both driving a real VNC
 * session over the FCC's relay (ADR-HEARTH-033). Deliberately doesn't render the Pi's screen: see
 * the ADR for why that's the right scope for "no keyboard/mouse needed," not a corner cut.
 */
export function CommandCenterRemoteScreen({ onBack }: CommandCenterRemoteScreenProps) {
  // See DiscoverDevicesScreen.tsx's identical comment — a hardcoded paddingTop guessed for an
  // iPhone notch never accounted for Android's own, differently-sized status bar.
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [errorMessage, setErrorMessage] = useState("");
  const [serverInfo, setServerInfo] = useState<RfbServerInfo | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [shift, setShift] = useState(false);

  const clientRef = useRef<RfbClient | null>(null);
  const cursorRef = useRef({ x: 0, y: 0 });
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const totalMovementRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      const config = await loadFamilyCommandCenterConfig();
      if (!config) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Family Command Center isn't paired yet — connect it in Settings first.");
        }
        return;
      }

      const client = new RfbClient(buildVncRelayUrl(config));
      try {
        const info = await client.connect();
        if (cancelled) {
          client.disconnect();
          return;
        }
        clientRef.current = client;
        cursorRef.current = { x: Math.floor(info.width / 2), y: Math.floor(info.height / 2) };
        setServerInfo(info);
        setStatus("connected");
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : String(err));
        }
      }
    }

    connect();
    return () => {
      cancelled = true;
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, []);

  function moveCursor(dx: number, dy: number) {
    const info = serverInfo;
    const client = clientRef.current;
    if (!info || !client) return;
    const nextX = Math.max(0, Math.min(info.width - 1, cursorRef.current.x + dx));
    const nextY = Math.max(0, Math.min(info.height - 1, cursorRef.current.y + dy));
    cursorRef.current = { x: nextX, y: nextY };
    client.sendPointerEvent(nextX, nextY, 0);
  }

  function click(button: number) {
    const client = clientRef.current;
    if (!client) return;
    const { x, y } = cursorRef.current;
    client.sendPointerEvent(x, y, button);
    setTimeout(() => client.sendPointerEvent(x, y, 0), CLICK_RELEASE_DELAY_MS);
  }

  function pressKey(keysym: number) {
    const client = clientRef.current;
    if (!client) return;
    client.sendKeyEvent(keysym, true);
    client.sendKeyEvent(keysym, false);
  }

  function pressChar(char: string) {
    const keysym = charToKeysym(shift ? char.toUpperCase() : char);
    if (keysym !== undefined) pressKey(keysym);
    if (shift) setShift(false); // one-shot, like a phone's own shift key
  }

  function handleTrackpadGrant(event: GestureResponderEvent) {
    lastTouchRef.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
    totalMovementRef.current = 0;
  }

  function handleTrackpadMove(event: GestureResponderEvent) {
    const last = lastTouchRef.current;
    if (!last) return;
    const { pageX, pageY } = event.nativeEvent;
    const dx = pageX - last.x;
    const dy = pageY - last.y;
    lastTouchRef.current = { x: pageX, y: pageY };
    totalMovementRef.current += Math.abs(dx) + Math.abs(dy);
    moveCursor(dx * TRACKPAD_SENSITIVITY, dy * TRACKPAD_SENSITIVITY);
  }

  function handleTrackpadRelease() {
    if (totalMovementRef.current < TAP_MOVEMENT_THRESHOLD) {
      click(RfbButton.Left);
    }
    lastTouchRef.current = null;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + theme.spacing.lg }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerDivider}>|</Text>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            Command Center
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {status === "connected" && serverInfo ? serverInfo.name : "Trackpad & keyboard"}
          </Text>
        </View>
        <CapabilityButton
          shape="circle"
          icon="keypad-outline"
          label="Keyboard"
          variant={keyboardVisible ? "accent" : "ghost"}
          onPress={() => setKeyboardVisible((current) => !current)}
          disabled={status !== "connected"}
        />
      </View>

      {status === "connecting" && (
        <View style={styles.centerFill}>
          <ActivityIndicator color={theme.accentEnd} size="large" />
          <Text style={styles.statusText}>Connecting…</Text>
        </View>
      )}

      {status === "error" && (
        <View style={styles.centerFill}>
          <Ionicons name="alert-circle-outline" size={28} color={theme.statusError} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      {status === "connected" && (
        <>
          <View
            style={styles.trackpad}
            onStartShouldSetResponder={() => true}
            onResponderGrant={handleTrackpadGrant}
            onResponderMove={handleTrackpadMove}
            onResponderRelease={handleTrackpadRelease}
          >
            <Text style={styles.trackpadHint}>Drag to move • Tap to click</Text>
          </View>

          <View style={styles.clickRow}>
            <CapabilityButton label="Left click" onPress={() => click(RfbButton.Left)} containerStyle={styles.clickButton} />
            <CapabilityButton label="Right click" onPress={() => click(RfbButton.Right)} containerStyle={styles.clickButton} />
          </View>

          {keyboardVisible && (
            <View style={styles.keyboard}>
              <View style={styles.row}>
                <CapabilityButton shape="circle" icon="chevron-up" label="Up" onPress={() => pressKey(Keysym.Up)} />
              </View>
              <View style={styles.row}>
                <CapabilityButton shape="circle" icon="chevron-back" label="Left" onPress={() => pressKey(Keysym.Left)} />
                <CapabilityButton shape="circle" icon="chevron-down" label="Down" onPress={() => pressKey(Keysym.Down)} />
                <CapabilityButton shape="circle" icon="chevron-forward" label="Right" onPress={() => pressKey(Keysym.Right)} />
              </View>

              {KEYBOARD_ROWS.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.row}>
                  {rowIndex === 2 && (
                    <Pressable
                      onPress={() => setShift((current) => !current)}
                      style={[styles.key, styles.wideKey, shift && styles.keyActive]}
                      accessibilityRole="button"
                      accessibilityLabel="Shift"
                    >
                      <Ionicons name="arrow-up-outline" size={18} color={shift ? theme.background : theme.textPrimary} />
                    </Pressable>
                  )}
                  {row.map((char) => (
                    <Pressable key={char} onPress={() => pressChar(char)} style={styles.key} accessibilityRole="button" accessibilityLabel={char}>
                      <Text style={styles.keyLabel}>{shift ? char.toUpperCase() : char}</Text>
                    </Pressable>
                  ))}
                  {rowIndex === 2 && (
                    <Pressable
                      onPress={() => pressKey(Keysym.Backspace)}
                      style={[styles.key, styles.wideKey]}
                      accessibilityRole="button"
                      accessibilityLabel="Backspace"
                    >
                      <Ionicons name="backspace-outline" size={18} color={theme.textPrimary} />
                    </Pressable>
                  )}
                </View>
              ))}

              <View style={styles.row}>
                <Pressable onPress={() => pressKey(Keysym.Escape)} style={[styles.key, styles.modeKey]} accessibilityRole="button" accessibilityLabel="Escape">
                  <Text style={styles.keyLabel}>esc</Text>
                </Pressable>
                <Pressable onPress={() => pressChar(" ")} style={[styles.key, styles.spaceKey]} accessibilityRole="button" accessibilityLabel="Space">
                  <Text style={styles.keyLabel}>space</Text>
                </Pressable>
                <Pressable
                  onPress={() => pressKey(Keysym.Tab)}
                  style={[styles.key, styles.modeKey]}
                  accessibilityRole="button"
                  accessibilityLabel="Tab"
                >
                  <Text style={styles.keyLabel}>tab</Text>
                </Pressable>
                <Pressable
                  onPress={() => pressKey(Keysym.Return)}
                  style={[styles.key, styles.modeKey, styles.doneKey]}
                  accessibilityRole="button"
                  accessibilityLabel="Return"
                >
                  <Text style={[styles.keyLabel, styles.doneLabel]}>return</Text>
                </Pressable>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background, padding: theme.spacing.lg, gap: theme.spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  headerDivider: { color: theme.textTertiary, fontSize: theme.type.subtitle },
  // minWidth: 0 overrides Yoga's default min-content floor for a flex:1 item — same fix as
  // DeviceListScreen's and UniversalTvRemote's own headers (ADR-HEARTH-046): this screen has the
  // identical shape (back chevron, divider, flex:1 title/subtitle, a fixed circle button) and was
  // missed by that pass — a real dynamic VNC server name (serverInfo.name) can be long/unbreakable
  // the same way a renamed TV can be, overlapping the Keyboard toggle button without this.
  headerText: { flex: 1, minWidth: 0 },
  title: { color: theme.textPrimary, fontSize: theme.type.title, fontWeight: "700" },
  subtitle: { color: theme.textTertiary, fontSize: theme.type.caption, marginTop: theme.spacing.xs },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md },
  statusText: { color: theme.textSecondary, fontSize: theme.type.body },
  errorText: { color: theme.statusError, fontSize: theme.type.label, textAlign: "center", paddingHorizontal: theme.spacing.xl },
  trackpad: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  trackpadHint: { color: theme.textTertiary, fontSize: theme.type.label },
  clickRow: { flexDirection: "row", gap: theme.spacing.md },
  clickButton: { flex: 1 },
  keyboard: { backgroundColor: theme.surface, borderRadius: theme.radius.lg, padding: theme.spacing.sm, gap: theme.spacing.xs },
  row: { flexDirection: "row", gap: theme.spacing.xs, justifyContent: "center" },
  key: {
    flex: 1,
    height: 42,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  keyActive: { backgroundColor: theme.accentEnd },
  wideKey: { flex: 1.5 },
  modeKey: { flex: 1.5 },
  spaceKey: { flex: 5 },
  doneKey: { backgroundColor: theme.accentEnd },
  keyLabel: { color: theme.textPrimary, fontSize: theme.type.body, fontWeight: "600" },
  doneLabel: { color: theme.background, fontWeight: "700" },
});
