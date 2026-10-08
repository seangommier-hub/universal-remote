import { Device } from "../core/types/Device";
import { NetworkDevice } from "./discoverAll";
import { findNewDevices, newDevicesMessage, newDevicesTabLabel, noticeKeys } from "./newDeviceAlert";

let counter = 0;
function net(overrides: Partial<NetworkDevice>): NetworkDevice {
  counter += 1;
  return {
    id: `n${counter}`, ip: `192.168.1.${counter}`, mac: null, hostname: null, vendor: null, brand: null, model: null, confidence: "unknown",
    evidence: [], online: true, kind: null, friendlyName: null, hidden: false, labelBrand: null, ...overrides,
  };
}

function saved(ip: string): Device {
  return { id: "s", name: "Saved", category: "tv", manufacturer: "x", driverId: "d", capabilities: [], config: { ipAddress: ip } };
}

describe("findNewDevices", () => {
  test("counts recognized, online, not-added, not-hidden devices", () => {
    const roku = net({ brand: "roku", confidence: "certain", mac: "aa:aa:aa:aa:aa:01" });
    const lg = net({ brand: "lg", confidence: "likely" });
    expect(findNewDevices([roku, lg], [], {}, [])).toHaveLength(2);
  });

  test("ignores unrecognized devices such as cameras, phones and routers", () => {
    const noise = [net({ hostname: "Ring-Cam-1", kind: "camera" }), net({ hostname: "router", vendor: "Netgear" }), net({})];
    expect(findNewDevices(noise, [], {}, [])).toHaveLength(0);
  });

  test("ignores recognized devices that are off right now", () => {
    expect(findNewDevices([net({ brand: "lg", online: false })], [], {}, [])).toHaveLength(0);
  });

  test("ignores devices that are already added", () => {
    const lg = net({ brand: "lg", ip: "192.168.1.50" });
    expect(findNewDevices([lg], [saved("192.168.1.50")], {}, [])).toHaveLength(0);
  });

  test("ignores devices hidden by the person or by the household", () => {
    const hiddenByPerson = net({ brand: "roku", mac: "aa:aa:aa:aa:aa:02" });
    const hiddenByHousehold = net({ brand: "lg", hidden: true });
    const labels = { "aa:aa:aa:aa:aa:02": { hidden: true } };
    expect(findNewDevices([hiddenByPerson, hiddenByHousehold], [], labels, [])).toHaveLength(0);
  });

  test("a device the person un-hid counts again", () => {
    const device = net({ brand: "roku", mac: "aa:aa:aa:aa:aa:03", hidden: true });
    expect(findNewDevices([device], [], { "aa:aa:aa:aa:aa:03": { hidden: false } }, [])).toHaveLength(1);
  });

  test("counts a device whose brand the person set by hand", () => {
    const unknown = net({ mac: "aa:aa:aa:aa:aa:04" });
    expect(findNewDevices([unknown], [], { "aa:aa:aa:aa:aa:04": { brand: "roku" } }, [])).toHaveLength(1);
  });

  test("skips devices already noticed, matched by MAC even after the address changes", () => {
    const before = net({ brand: "roku", mac: "aa:aa:aa:aa:aa:05", ip: "192.168.1.200" });
    const afterAddressChange = { ...before, ip: "192.168.1.201" };
    const noticed = noticeKeys(findNewDevices([before], [], {}, []));
    expect(findNewDevices([afterAddressChange], [], {}, noticed)).toHaveLength(0);
  });

  test("a device with no MAC is noticed by address", () => {
    const device = net({ brand: "lg", ip: "192.168.1.77" });
    expect(noticeKeys(findNewDevices([device], [], {}, []))).toEqual(["192.168.1.77"]);
  });

  test("a different device that appears later is still new", () => {
    const first = net({ brand: "roku", mac: "aa:aa:aa:aa:aa:06" });
    const second = net({ brand: "lg", mac: "aa:aa:aa:aa:aa:07" });
    const noticed = noticeKeys(findNewDevices([first], [], {}, []));
    expect(findNewDevices([first, second], [], {}, noticed).map((row) => row.device.mac)).toEqual(["aa:aa:aa:aa:aa:07"]);
  });
});

describe("new device copy", () => {
  test("message is singular for one and plural otherwise", () => {
    expect(newDevicesMessage(1)).toBe("1 new device found on your network");
    expect(newDevicesMessage(3)).toBe("3 new devices found on your network");
  });

  test("tab label names the count only when there is one", () => {
    expect(newDevicesTabLabel(0)).toBe("Devices");
    expect(newDevicesTabLabel(1)).toBe("Devices, 1 new device found");
    expect(newDevicesTabLabel(2)).toBe("Devices, 2 new devices found");
  });
});
