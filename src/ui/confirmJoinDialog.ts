import { Alert } from "react-native";
import { buildJoinConfirmation, JoinPreview } from "../discovery/joinPreview";

/** Shows the join confirmation naming the host; resolves true only when the person taps Join. */
export function confirmJoinDialog(preview: JoinPreview): Promise<boolean> {
  const { title, message } = buildJoinConfirmation(preview);
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: preview.currentHost ? "Replace" : "Join", style: preview.currentHost ? "destructive" : "default", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
