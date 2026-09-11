import { SmartThingsApiError, SmartThingsClient } from "./SmartThingsClient";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("SmartThingsClient", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  describe("listOutlets", () => {
    test("returns only devices with a switch capability on their main component", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              deviceId: "outlet-1",
              label: "Living Room Lamp",
              name: "Smart Plug",
              components: [{ id: "main", capabilities: [{ id: "switch" }] }],
            },
            {
              deviceId: "sensor-1",
              label: "Front Door Sensor",
              name: "Contact Sensor",
              components: [{ id: "main", capabilities: [{ id: "contactSensor" }] }],
            },
          ],
        })
      );
      const client = new SmartThingsClient("test-token");

      const outlets = await client.listOutlets();

      expect(outlets).toEqual([{ deviceId: "outlet-1", label: "Living Room Lamp" }]);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.smartthings.com/v1/devices?capability=switch",
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-token" }) })
      );
    });

    test("falls back to the device's own name when it has no user-assigned label", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        jsonResponse({
          items: [{ deviceId: "outlet-1", name: "Smart Plug", components: [{ id: "main", capabilities: [{ id: "switch" }] }] }],
        })
      );
      const client = new SmartThingsClient("test-token");

      expect(await client.listOutlets()).toEqual([{ deviceId: "outlet-1", label: "Smart Plug" }]);
    });
  });

  describe("getSwitchState / setSwitchState", () => {
    test("getSwitchState reads the current value", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ switch: { value: "on" } }));
      const client = new SmartThingsClient("test-token");

      expect(await client.getSwitchState("outlet-1")).toBe("on");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.smartthings.com/v1/devices/outlet-1/components/main/capabilities/switch/status",
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-token" }) })
      );
    });

    test("setSwitchState sends the SmartThings command shape", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}));
      const client = new SmartThingsClient("test-token");

      await client.setSwitchState("outlet-1", "off");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.smartthings.com/v1/devices/outlet-1/commands",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ commands: [{ component: "main", capability: "switch", command: "off" }] }),
        })
      );
    });
  });

  test("throws SmartThingsApiError (carrying the real status) on any non-OK response", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}, false, 401));
    const client = new SmartThingsClient("expired-token");

    await expect(client.getSwitchState("outlet-1")).rejects.toBeInstanceOf(SmartThingsApiError);
    await expect(client.getSwitchState("outlet-1")).rejects.toMatchObject({ status: 401 });
  });
});
