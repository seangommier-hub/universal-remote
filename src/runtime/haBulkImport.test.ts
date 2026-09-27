import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { resetHaInstancesForTests } from "../drivers/homeAssistant/haInstanceRegistry";
import { HaImportCandidate } from "../drivers/homeAssistant/haImportCandidates";
import { prepareHaImport } from "./haBulkImport";
import { loadDeviceLayout } from "./deviceLayoutPersistence";

const disk = new Map<string, string>();
const secrets = new Map<string, string>();

function candidate(entityId: string, areaName: string | null): HaImportCandidate {
  return { entityId, domain: "switch", name: entityId, category: "outlet", capabilities: ["power"], areaName, alreadyAdded: false };
}

beforeEach(() => {
  disk.clear();
  secrets.clear();
  resetHaInstancesForTests();
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => disk.get(key) ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => void disk.set(key, value));
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => void secrets.set(key, value));
});

describe("prepareHaImport", () => {
  test("saves the credential once, builds one device per entity, and sets each device's room from its area in one layout write", async () => {
    const chosen = [candidate("switch.a", "Kitchen"), candidate("switch.b", "Den"), candidate("switch.c", null)];
    const { devices, rooms } = await prepareHaImport(chosen, "ha.test", " tok ");

    expect(devices).toHaveLength(3);
    expect(new Set(devices.map((d) => d.id)).size).toBe(3);
    expect(new Set(devices.map((d) => d.config?.instanceId)).size).toBe(1);
    expect(devices.every((d) => d.config?.token === undefined)).toBe(true);
    expect([...secrets.values()]).toEqual(["tok"]);
    expect(rooms).toEqual({ [devices[0].id]: "Kitchen", [devices[1].id]: "Den" });
    expect((await loadDeviceLayout()).rooms).toEqual(rooms);
    expect((AsyncStorage.setItem as jest.Mock).mock.calls.filter(([key]) => key === "hearth.deviceLayout.v1")).toHaveLength(1);
  });

  test("re-syncing sets rooms only for the newly imported devices and leaves earlier room choices alone", async () => {
    const first = await prepareHaImport([candidate("switch.a", "Kitchen")], "ha.test", "tok");
    const second = await prepareHaImport([candidate("switch.d", "Garage")], "ha.test", "tok");
    const layout = await loadDeviceLayout();
    expect(layout.rooms).toEqual({ [first.devices[0].id]: "Kitchen", [second.devices[0].id]: "Garage" });
  });
});
