import { NetworkDevice } from "./discoverAll";
import { planAddAll, stepsHeadline } from "./addAllPlan";
import { runAddAll, describeAddAllSummary, RowRunResult } from "./addAllRunner";
import { AddOutcome } from "./addDeviceFlow";
import { DiscoveryRow, toDiscoveryRow } from "./discoveryRows";
import { Device } from "../core/types/Device";

function net(overrides: Partial<NetworkDevice>): NetworkDevice {
  return { id: "n", ip: "192.168.1.10", mac: null, hostname: null, vendor: null, brand: null, model: null, confidence: "certain", evidence: [], online: true, kind: null, friendlyName: null, hidden: false, labelBrand: null, ...overrides };
}

function row(id: string, overrides: Partial<NetworkDevice>): DiscoveryRow {
  return toDiscoveryRow(net({ id, ip: `192.168.1.${id.length + 20}`, ...overrides }), []);
}

const roku = row("roku", { brand: "roku" });
const yamaha = row("yamaha", { brand: "yamaha", ip: "192.168.1.41" });
const lg = row("lg", { brand: "lg", ip: "192.168.1.42" });
const sony = row("sony", { brand: "sony", ip: "192.168.1.43" });
const appleTv = row("appletv", { brand: "appletv", ip: "192.168.1.44" });
const chromecast = row("chromecast", { brand: "chromecast", ip: "192.168.1.45" });

describe("planAddAll", () => {
  test("test_plain_ip_brands_are_added_automatically_and_pairing_brands_become_steps", () => {
    const plan = planAddAll([roku, yamaha, lg, sony, appleTv], true);
    expect(plan.auto.map((r) => r.device.id)).toEqual(["roku", "yamaha"]);
    expect(plan.steps.map((s) => [s.row.device.id, s.reason])).toEqual([
      ["lg", "approve-on-device"],
      ["sony", "enter-key"],
      ["appletv", "guided-pairing"],
    ]);
  });

  test("test_brand_that_needs_family_command_center_is_a_step_only_until_it_is_set_up", () => {
    expect(planAddAll([chromecast], true).auto).toHaveLength(1);
    expect(planAddAll([chromecast], false).steps[0]).toMatchObject({ reason: "needs-fcc" });
  });

  test("test_offline_hidden_unrecognized_and_added_rows_are_left_out", () => {
    const offline = row("off", { brand: "roku", online: false, ip: "192.168.1.50" });
    const unknown = row("mystery", { ip: "192.168.1.51" });
    const hidden = toDiscoveryRow(net({ id: "hid", brand: "roku", ip: "192.168.1.52", hidden: true }), []);
    expect(planAddAll([offline, unknown, hidden], true)).toEqual({ auto: [], steps: [] });
  });

  test("test_step_instruction_uses_the_pairing_prompt_when_one_exists", () => {
    const plan = planAddAll([lg], true);
    expect(plan.steps[0].instruction).toContain("LG Remote App");
  });

  test("test_steps_headline_is_singular_or_plural", () => {
    expect(stepsHeadline(1)).toBe("1 needs a quick step");
    expect(stepsHeadline(2)).toBe("2 need a quick step");
  });
});

describe("runAddAll", () => {
  const device = (id: string): Device => ({ id, name: id, category: "tv", manufacturer: "x", driverId: "d", capabilities: [] });

  test("test_runs_one_at_a_time_in_order_and_summarizes_each_outcome", async () => {
    const order: string[] = [];
    const outcomes: Record<string, AddOutcome> = {
      roku: { kind: "added", device: device("roku") },
      yamaha: { kind: "failed", message: "Couldn't reach it", diagnosis: null },
      lg: { kind: "needs-fields", fields: [] },
    };
    const statuses: Record<string, RowRunResult[]> = {};
    const added: Device[] = [];
    const summary = await runAddAll(
      [roku, yamaha, lg],
      async (r) => {
        order.push(r.device.id);
        return outcomes[r.device.id];
      },
      { onStatus: (id, result) => (statuses[id] = [...(statuses[id] ?? []), result]), onAdded: (d) => added.push(d) }
    );
    expect(order).toEqual(["roku", "yamaha", "lg"]);
    expect(added.map((d) => d.id)).toEqual(["roku"]);
    expect(summary.failed).toEqual([{ row: yamaha, message: "Couldn't reach it" }]);
    expect(summary.needsStep).toEqual([lg]);
    expect(statuses.roku.map((s) => s.status)).toEqual(["waiting", "adding", "added"]);
    expect(statuses.yamaha.at(-1)).toEqual({ status: "failed", message: "Couldn't reach it" });
    expect(statuses.lg.at(-1)?.status).toBe("needs-step");
  });

  test("test_a_thrown_connect_becomes_a_failure_and_the_run_continues", async () => {
    const summary = await runAddAll(
      [roku, yamaha],
      async (r) => {
        if (r.device.id === "roku") throw new Error("socket exploded");
        return { kind: "added", device: device("yamaha") };
      },
      { onStatus: () => undefined, onAdded: () => undefined }
    );
    expect(summary.failed[0].message).toBe("socket exploded");
    expect(summary.added).toHaveLength(1);
  });

  test("test_summary_line_mentions_only_what_happened", () => {
    const base = { added: [device("a"), device("b")], failed: [], needsStep: [] };
    expect(describeAddAllSummary(base, 0)).toBe("Added 2 devices");
    expect(describeAddAllSummary({ ...base, failed: [{ row: roku, message: "x" }] }, 2)).toBe("Added 2 devices · 1 couldn't connect · 2 need a quick step");
    expect(describeAddAllSummary({ added: [], failed: [], needsStep: [] }, 0)).toBe("Nothing was added");
  });
});
