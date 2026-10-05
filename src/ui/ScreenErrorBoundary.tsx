import { Component, ErrorInfo, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { logger } from "../core/logging/logger";
import { CapabilityButton } from "./CapabilityButton";
import { theme } from "./theme";

// ADR-HEARTH-207: this app had no error boundary anywhere, so one component throwing while it
// rendered closed the whole app in a release build. This keeps a failing screen contained: it shows
// a plain message with a way back, and logs the error at error level so it ships to the Pi.

const LOG_SCOPE = "ScreenErrorBoundary";
const FALLBACK_TEXT = "Something on this screen stopped working. Nothing was changed. Go back and try again.";

interface ScreenErrorBoundaryProps {
  /** Names the screen in the log line. */
  screenName: string;
  onBack: () => void;
  children: ReactNode;
}

interface ScreenErrorBoundaryState {
  failed: boolean;
}

/** Catches a render error inside one screen so it shows a fallback instead of closing the app. */
export class ScreenErrorBoundary extends Component<ScreenErrorBoundaryProps, ScreenErrorBoundaryState> {
  state: ScreenErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ScreenErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error(LOG_SCOPE, `${this.props.screenName} failed to render`, {
      message: error.message,
      componentStack: info.componentStack ?? "",
    });
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.container} accessibilityLabel={`${this.props.screenName} could not be shown`}>
        <Text style={styles.text}>{FALLBACK_TEXT}</Text>
        <CapabilityButton label="Back" variant="accent" onPress={this.props.onBack} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: theme.spacing.lg, gap: theme.spacing.lg },
  text: { color: theme.textPrimary, fontSize: theme.type.label, textAlign: "center", lineHeight: 20 },
});
