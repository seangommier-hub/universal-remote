// ADR-HEARTH-157: the fake `discover/all` response body (server row shape, see src/discovery/discoverAll.ts).

interface DemoRow {
  ip: string;
  mac: string;
  hostname: string | null;
  vendor: string | null;
  brand: string | null;
  model: string | null;
  confidence: string;
  kind: string;
  friendlyName: string | null;
}

const MAC_PREFIX = "aa:bb:cc:00:00:";

function row(tail: number, kind: string, hostname: string | null, vendor: string | null, extra: Partial<DemoRow> = {}): DemoRow {
  const mac = `${MAC_PREFIX}${tail.toString(16).padStart(2, "0")}`;
  return { ip: `192.168.1.${tail}`, mac, hostname, vendor, brand: null, model: null, confidence: "unknown", kind, friendlyName: null, ...extra };
}

const RECOGNIZED: DemoRow[] = [
  row(20, "tv", "lgwebostv", "LG Electronics", { brand: "lg", confidence: "certain", model: "OLED55C3", friendlyName: "Living Room TV" }),
  row(61, "tv", "BRAVIA-KD-65", "Sony", { brand: "sony", confidence: "certain", model: "KD-65X85K", friendlyName: "Sony BRAVIA" }),
  row(62, "streaming", "Chromecast", "Google", { brand: "chromecast", confidence: "likely", friendlyName: "Office Chromecast" }),
  row(63, "console", "XboxOne", "Microsoft", { brand: "xbox", confidence: "certain", friendlyName: "Xbox Series X" }),
  row(64, "audio", "yamaha-rx-v485", "Yamaha", { brand: "yamaha", confidence: "likely", friendlyName: "Yamaha Receiver" }),
  row(65, "streaming", "Apple-TV", "Apple", { brand: "appletv", confidence: "guess" }),
];

const OTHER: DemoRow[] = [
  row(70, "camera", "Reolink-Doorbell", "Reolink", { friendlyName: "Front Door Camera" }),
  row(71, "camera", "wyze-cam-v3", "Wyze"),
  row(72, "camera", "IPC-5A", null),
  row(73, "camera", "arlo-pro-4", "Arlo"),
  row(80, "phone", "Seans-iPhone", "Apple", { friendlyName: "Sean's iPhone" }),
  row(81, "phone", "Leahs-iPhone", "Apple", { friendlyName: "Leah's iPhone" }),
  row(82, "phone", "Galaxy-S23", "Samsung"),
  row(83, "phone", "Pixel-8", "Google"),
  row(84, "phone", "iPad", "Apple", { friendlyName: "Kitchen iPad" }),
  row(1, "network", "router.lan", "Netgear", { friendlyName: "Router" }),
  row(2, "network", "orbi-satellite", "Netgear"),
  row(90, "printer", "HP-LaserJet-M182", "HP"),
  row(91, "computer", "DESKTOP-4F2K", "Dell"),
  row(92, "computer", "MacBook-Pro", "Apple", { friendlyName: "Sean's MacBook" }),
  row(93, "computer", "raspberrypi", "Raspberry Pi", { friendlyName: "Family Command Center" }),
  row(100, "iot", "esp32-feeder", "Espressif"),
  row(101, "iot", "ring-chime", "Ring"),
  row(102, "iot", "ecobee-thermostat", "ecobee"),
  row(103, "iot", "roomba-j7", "iRobot"),
  row(104, "unknown", null, null),
  row(105, "unknown", null, "Shenzhen Bilian"),
];

/** Builds the JSON body the demo fetch returns for the discover-all endpoint: 6 recognized devices plus 21 others. */
export function demoDiscoverAllBody(): { devices: Array<DemoRow & { id: string; evidence: string[]; online: boolean; hidden: boolean; labelBrand: null }> } {
  const devices = [...RECOGNIZED, ...OTHER].map((entry) => ({ ...entry, id: `net-${entry.ip}`, evidence: [], online: true, hidden: false, labelBrand: null }));
  return { devices };
}
