// SmartThings Cloud REST API (https://api.smartthings.com/v1) — cloud-only by nature (there's no
// local-network equivalent; SmartThings devices are controlled through Samsung's own cloud), so
// unlike every other driver in this codebase (LG/Samsung TV, Sony, Roku, Hue — all local-network-
// first with a relay fallback) this one has no direct-connection path to fall back FROM. See
// ADR-HEARTH-042 for why SmartThings was chosen over building against Alexa directly (Amazon has
// no public API for a third-party app to control a user's already-connected devices at all).

const API_BASE = "https://api.smartthings.com/v1";
const SWITCH_CAPABILITY = "switch";
const MAIN_COMPONENT = "main";

export interface SmartThingsDevice {
  deviceId: string;
  /** The user-assigned name in the SmartThings app — what Hearth shows, same as every other discovered device's name being whatever the source system calls it. */
  label: string;
}

export type SwitchState = "on" | "off";

export class SmartThingsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

/** Thin wrapper around the SmartThings Cloud API for exactly what an outlet/plug driver needs: list devices with a switch, read/set that switch. Every call takes the access token explicitly rather than holding one internally — SmartThingsOutletDriver owns the refresh-before-expiry logic and always passes a known-fresh token in. */
export class SmartThingsClient {
  constructor(private accessToken: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json", ...init?.headers },
    });
    if (!response.ok) {
      throw new SmartThingsApiError(`SmartThings returned ${response.status}`, response.status);
    }
    return (await response.json()) as T;
  }

  /** Every device on the account with a `switch` capability on its main component — the only shape this outlet driver understands. A user's SmartThings account may have many other device types (sensors, locks, thermostats); those are silently excluded here, not surfaced as "unsupported" the way FamilyCommandCenterDiscoveryProvider does for TVs, since SmartThings itself is the discovery/pairing UI for this integration, not Hearth's own scan screen. */
  async listOutlets(): Promise<SmartThingsDevice[]> {
    const { items } = await this.request<{ items: RawDevice[] }>("/devices?capability=switch");
    return items
      .filter((item) => item.components?.some((c) => c.id === MAIN_COMPONENT && c.capabilities?.some((cap) => cap.id === SWITCH_CAPABILITY)))
      .map((item) => ({ deviceId: item.deviceId, label: item.label ?? item.name }));
  }

  async getSwitchState(deviceId: string): Promise<SwitchState> {
    const status = await this.request<{ switch: { value: SwitchState } }>(
      `/devices/${deviceId}/components/${MAIN_COMPONENT}/capabilities/${SWITCH_CAPABILITY}/status`
    );
    return status.switch.value;
  }

  async setSwitchState(deviceId: string, state: SwitchState): Promise<void> {
    await this.request(`/devices/${deviceId}/commands`, {
      method: "POST",
      body: JSON.stringify({ commands: [{ component: MAIN_COMPONENT, capability: SWITCH_CAPABILITY, command: state }] }),
    });
  }
}

interface RawDevice {
  deviceId: string;
  label?: string;
  name: string;
  components?: { id: string; capabilities?: { id: string }[] }[];
}
