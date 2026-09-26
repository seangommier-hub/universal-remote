import { Modal, ScrollView, View } from "react-native";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { ActivityResultsCard } from "./ActivityResultsCard";
import { theme } from "./theme";
import { LastActivityRun } from "./useActivities";

interface ActivityRunModalProps {
  lastRun: LastActivityRun | null;
  devices: Device[];
  stateStore: StateStore;
  onRetryFailed: () => void;
  onDismiss: () => void;
}

/** Pops the per-step results of a home-screen activity run, but only when something did not finish; a clean run stays quiet. */
export function ActivityRunModal({ lastRun, devices, stateStore, onRetryFailed, onDismiss }: ActivityRunModalProps) {
  const needsAttention = lastRun !== null && lastRun.surface === "modal" && lastRun.steps.some((step) => step.status !== "ok");
  if (!lastRun || !needsAttention) return null;
  return (
    <Modal transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={{ flex: 1, backgroundColor: "#00000099", justifyContent: "center", padding: theme.spacing.xl }}>
        <ScrollView>
          <ActivityResultsCard
            activity={lastRun.activity}
            steps={lastRun.steps}
            cancelled={lastRun.result.cancelled}
            devices={devices}
            inputsOf={(deviceId) => stateStore.get(deviceId).values.inputs}
            onRetryFailed={onRetryFailed}
            onDismiss={onDismiss}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}
