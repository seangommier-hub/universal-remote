// Each scenario: a file-safe name, the demo ?screen= value, an optional extra query string, optional in-page steps, and whether the
// no-vertical-scroll assertion is enforced (only the remote pages are tuned to fit, ADR-HEARTH-135).

const TAB_SETTLE_MS = 400;
const ADD_ALL_MIDWAY_MS = 900;
const ADD_ALL_FINISHED_MS = 3600;
const SCROLL_STEP_PX = 700;
const OFFLINE_SETTLE_MS = 4000;
const LONG_PRESS_MS = 800;

// A real long press: hold the pointer over the row long enough for onLongPress to fire.
async function longPress(page, label) {
  const row = page.getByLabel(label, { exact: true }).first();
  await row.scrollIntoViewIfNeeded();
  const box = await row.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(LONG_PRESS_MS);
  await page.mouse.up();
  await page.waitForTimeout(TAB_SETTLE_MS);
}

const TYPES_QUERY = "household=types&layout=types";
const SCROLL_MID_PX = 1900;
const SCROLL_LOWER_PX = 2900;
const SCROLL_TO_END_PX = 4000;

// Scrolls the page's list with the wheel (react-native-web ScrollView), then lets it settle.
async function scrollList(page, distancePx) {
  await page.mouse.move(200, 500);
  await page.mouse.wheel(0, distancePx);
  await page.waitForTimeout(TAB_SETTLE_MS);
}

export const SCENARIOS = [
  { name: "devices-home", screen: "list", assertFit: false },
  // ADR-HEARTH-200: the one-time "All On / All Off" offer card (shows on the default fixture since
  // it has power-capable devices and no existing Activity by that name yet) and the result of
  // tapping through it -- two new chips added to the Activities row.
  { name: "default-activities-offer", screen: "list", assertFit: false },
  {
    name: "default-activities-generated",
    screen: "list",
    assertFit: false,
    steps: async (page) => {
      await page.getByText("Create Activities", { exact: true }).click();
      await page.waitForTimeout(TAB_SETTLE_MS);
      // The new "All On"/"All Off" chips land at the end of the horizontal Activities row --
      // scroll it sideways so the screenshot actually shows them, not just the pre-existing chips.
      const chipRow = page.getByLabel("Run All On", { exact: true });
      await chipRow.scrollIntoViewIfNeeded();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  { name: "offline-banner-fcc", screen: "list", query: "&offline=fcc", assertFit: false, settleMs: OFFLINE_SETTLE_MS },
  { name: "offline-banner-device", screen: "list", query: "&offline=device", assertFit: false, settleMs: OFFLINE_SETTLE_MS },
  {
    name: "offline-banner-dismissed",
    screen: "list", query: "&offline=fcc",
    assertFit: false,
    settleMs: OFFLINE_SETTLE_MS,
    steps: async (page) => {
      await page.getByLabel("Dismiss").first().click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  { name: "devices-rooms", screen: "list", query: "&layout=rooms", assertFit: false },
  { name: "devices-favorites-flat", screen: "list", query: "&layout=favorites", assertFit: false },
  {
    name: "devices-room-collapse",
    screen: "list",
    query: "&layout=rooms",
    assertFit: false,
    steps: async (page) => {
      await page.getByLabel(/^Living Room, 3 devices/).click();
      await page.getByLabel(/^Kitchen, 1 device/).click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "devices-actions-menu",
    screen: "list",
    query: "&layout=rooms",
    assertFit: false,
    steps: async (page) => longPress(page, "Bedroom TV"),
  },
  {
    name: "devices-set-room",
    screen: "list",
    query: "&layout=favorites",
    assertFit: false,
    steps: async (page) => {
      await longPress(page, "Basement Roku");
      await page.getByText("Set room", { exact: true }).click();
      await page.getByLabel("Use Den").click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "devices-set-room-saved",
    screen: "list",
    query: "&layout=favorites",
    assertFit: false,
    steps: async (page) => {
      await longPress(page, "Basement Roku");
      await page.getByText("Set room", { exact: true }).click();
      await page.getByLabel("Use Den").click();
      await page.getByText("Save room", { exact: true }).click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "devices-move-down",
    screen: "list",
    query: "&layout=rooms",
    assertFit: false,
    steps: async (page) => {
      await longPress(page, "Living Room TV");
      await page.getByText("Move down", { exact: true }).click();
      await page.getByText("Cancel", { exact: true }).click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  // ADR-HEARTH-193: the Devices tab grouped by type (the default), room mode, collapsed sections and kid mode.
  { name: "devices-types", screen: "list", query: `&${TYPES_QUERY}`, assertFit: false },
  { name: "devices-types-scrolled", screen: "list", query: `&${TYPES_QUERY}`, assertFit: false, steps: async (page) => scrollList(page, SCROLL_STEP_PX) },
  { name: "devices-types-scrolled-mid", screen: "list", query: `&${TYPES_QUERY}`, assertFit: false, steps: async (page) => scrollList(page, SCROLL_MID_PX) },
  { name: "devices-types-scrolled-lower", screen: "list", query: `&${TYPES_QUERY}`, assertFit: false, steps: async (page) => scrollList(page, SCROLL_LOWER_PX) },
  { name: "devices-types-scrolled-end", screen: "list", query: `&${TYPES_QUERY}`, assertFit: false, steps: async (page) => scrollList(page, SCROLL_TO_END_PX) },
  {
    name: "devices-types-collapsed",
    screen: "list",
    query: `&${TYPES_QUERY}`,
    assertFit: false,
    steps: async (page) => {
      await page.getByLabel(/^TVs & Streaming, \d+ devices/).click();
      await page.getByLabel(/^Cameras, \d+ devices/).click();
      await page.getByLabel(/^Sensors, \d+ devices/).click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "devices-types-room-mode",
    screen: "list",
    query: `&${TYPES_QUERY}`,
    assertFit: false,
    steps: async (page) => {
      await page.getByLabel("Group by Room", { exact: true }).click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "devices-types-actions-menu",
    screen: "list",
    query: `&${TYPES_QUERY}`,
    assertFit: false,
    steps: async (page) => longPress(page, "Den Apple TV"),
  },
  { name: "devices-types-fontscale-160", screen: "list", query: `&${TYPES_QUERY}&fontScale=1.6`, assertFit: false },
  // ADR-HEARTH-194: the "Now" summary -- a realistic mix of on/off devices across several
  // categories (TVs & Streaming, Lights, Plugs & Outlets, Climate & Fans on; Audio, Cameras,
  // Gaming, Vacuums, Covers, Sensors, Actions all correctly showing nothing) from the same
  // household=types&layout=types fixture the grouped-list scenarios above already use.
  {
    name: "devices-now",
    screen: "list",
    query: `&${TYPES_QUERY}`,
    assertFit: false,
    steps: async (page) => {
      await page.getByLabel("Now", { exact: true }).click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "devices-now-empty",
    screen: "list",
    query: `&${TYPES_QUERY}`,
    assertFit: false,
    steps: async (page) => {
      await page.getByLabel("Now", { exact: true }).click();
      await page.waitForTimeout(TAB_SETTLE_MS);
      // Turns every shown device off through its real one-tap Off button (a genuine CommandEngine
      // call, same as a real tap) until the calm empty state shows -- exercises the Off button and
      // the empty state together instead of needing a second, off-only fixture.
      while ((await page.getByLabel(/^Turn off /).count()) > 0) {
        await page.getByLabel(/^Turn off /).first().click();
        await page.waitForTimeout(200);
      }
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  { name: "kid-mode-types", screen: "list", query: `&${TYPES_QUERY}&kid=on`, assertFit: false },
  { name: "kid-mode-types-scrolled", screen: "list", query: `&${TYPES_QUERY}&kid=on`, assertFit: false, steps: async (page) => scrollList(page, SCROLL_STEP_PX) },
  { name: "kid-mode-list", screen: "list", query: "&layout=favorites&kid=on", assertFit: false },
  {
    name: "kid-mode-pin-prompt",
    screen: "list",
    query: "&layout=favorites&kid=on",
    assertFit: false,
    steps: async (page) => {
      await page.getByLabel("Leave kid mode").click();
      await page.getByLabel("PIN", { exact: true }).fill("1234");
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  { name: "kid-mode-bedtime", screen: "list", query: "&layout=favorites&kid=bedtime", assertFit: false },
  {
    name: "kid-mode-create-pin",
    screen: "fcc-settings",
    assertFit: false,
    steps: async (page) => {
      await page.getByText("Turn on kid mode", { exact: true }).scrollIntoViewIfNeeded();
      await page.getByText("Turn on kid mode", { exact: true }).click();
      await page.getByLabel("PIN", { exact: true }).fill("4827");
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "kid-mode-enabled-from-settings",
    screen: "fcc-settings",
    query: "&layout=favorites",
    assertFit: false,
    steps: async (page) => {
      await page.getByText("Turn on kid mode", { exact: true }).click();
      await page.getByLabel("PIN", { exact: true }).fill("4827");
      await page.getByText("Next", { exact: true }).click();
      await page.getByLabel("PIN", { exact: true }).fill("4827");
      await page.getByText("Save PIN", { exact: true }).click();
      await page.waitForSelector("text=Kid mode");
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  { name: "ha-sync", screen: "ha-sync", assertFit: false },
  {
    name: "ha-sync-untick",
    screen: "ha-sync",
    assertFit: false,
    steps: async (page) => {
      await page.getByLabel("Coffee Maker, selected").click();
      await page.getByLabel("Toggle all in Garage").click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  { name: "entity-garage", screen: "remote:ha-garage", assertFit: false },
  {
    name: "entity-garage-confirm",
    screen: "remote:ha-garage",
    assertFit: false,
    steps: async (page) => {
      await page.getByLabel("Open", { exact: true }).click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "entity-garage-opened",
    screen: "remote:ha-garage",
    assertFit: false,
    steps: async (page) => {
      await page.getByLabel("Open", { exact: true }).click();
      await page.getByText("Open", { exact: true }).last().click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "entity-lock-confirm",
    screen: "remote:ha-lock",
    assertFit: false,
    steps: async (page) => {
      await page.getByLabel("Unlock", { exact: true }).click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "entity-thermostat-raised",
    screen: "remote:ha-thermostat",
    assertFit: false,
    steps: async (page) => {
      await page.getByLabel("Raise temperature").click();
      await page.getByLabel("Raise temperature").click();
      await page.getByLabel("Cool", { exact: true }).click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  { name: "entity-fan", screen: "remote:ha-fan", assertFit: false },
  {
    name: "entity-scene-ran",
    screen: "remote:ha-scene",
    assertFit: false,
    steps: async (page) => {
      await page.getByLabel("Run", { exact: true }).click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  { name: "entity-sensor", screen: "remote:ha-temp", assertFit: false },
  { name: "entity-sensor-unavailable", screen: "remote:ha-offline", assertFit: false },
  { name: "entity-camera", screen: "remote:ha-camera", assertFit: false },
  // ADR-HEARTH-191: the Family Command Center (Ring) camera list — six demo cameras (one battery
  // doorbell, five wired, two with no snapshot yet) — and one camera's own entity screen for each
  // of the two interesting cases (a snapshot present, and none yet).
  { name: "fcc-cameras-list", screen: "cameras", assertFit: false },
  { name: "entity-camera-ring-doorbell", screen: "remote:fcc-camera-doorbell", assertFit: false },
  { name: "entity-camera-ring-no-snapshot", screen: "remote:fcc-camera-sideyard", assertFit: false },
  { name: "entity-alarm", screen: "remote:ha-alarm", assertFit: false },
  {
    name: "entity-alarm-code-pad",
    screen: "remote:ha-alarm",
    assertFit: false,
    steps: async (page) => {
      await page.getByLabel("Arm Away", { exact: true }).click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "entity-alarm-armed",
    screen: "remote:ha-alarm",
    assertFit: false,
    steps: async (page) => {
      await page.getByLabel("Arm Away", { exact: true }).click();
      await page.getByLabel("Alarm code", { exact: true }).fill("1234");
      await page.getByText("Continue", { exact: true }).click();
      await page.getByText("Arm Away", { exact: true }).first().click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "media-browse-root",
    screen: "remote:ha-media",
    assertFit: false,
    steps: async (page) => {
      await page.getByLabel("Browse", { exact: true }).click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "media-browse-folder",
    screen: "remote:ha-media",
    assertFit: false,
    steps: async (page) => {
      await page.getByLabel("Browse", { exact: true }).click();
      await page.getByLabel("Playlists", { exact: true }).click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  { name: "remote-lg", screen: "remote:lg", assertFit: true },
  // ADR-HEARTH-180: Dynamic Type approximation — Playwright can't emulate iOS's real accessibility
  // text sizes, so ?fontScale= scales theme.type instead (demoFontScale.ts). assertFit stays false
  // here on purpose: the remote's no-scroll invariant (ADR-HEARTH-135) is only asserted at the
  // DEFAULT text size above; a larger size is explicitly allowed to need scrolling, this scenario
  // is INFO-only so a human can review the screenshot for clipped/overlapping text, not cut-off scroll.
  { name: "remote-lg-fontscale-130", screen: "remote:lg", query: "&fontScale=1.3", assertFit: false },
  { name: "remote-lg-fontscale-160", screen: "remote:lg", query: "&fontScale=1.6", assertFit: false },
  { name: "devices-home-fontscale-130", screen: "list", query: "&fontScale=1.3", assertFit: false },
  { name: "devices-home-fontscale-160", screen: "list", query: "&fontScale=1.6", assertFit: false },
  {
    name: "remote-lg-keypad",
    screen: "remote:lg",
    assertFit: true,
    steps: async (page) => {
      await page.getByText("Keypad").first().click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "remote-lg-keyboard",
    screen: "remote:lg",
    assertFit: true,
    steps: async (page) => {
      await page.getByText("Keyboard").first().click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  { name: "remote-samsung", screen: "remote:samsung", assertFit: true },
  { name: "remote-roku-offline", screen: "remote:roku", assertFit: false },
  { name: "discover", screen: "discover", assertFit: false, settleMs: 2500 },
  {
    name: "discover-add-all-running",
    screen: "discover",
    assertFit: false,
    settleMs: 2500,
    steps: async (page) => {
      await page.getByText("Add all 4", { exact: true }).click();
      await page.waitForTimeout(ADD_ALL_MIDWAY_MS);
    },
  },
  {
    name: "discover-add-all-done",
    screen: "discover",
    assertFit: false,
    settleMs: 2500,
    steps: async (page) => {
      await page.getByText("Add all 4", { exact: true }).click();
      await page.waitForTimeout(ADD_ALL_FINISHED_MS);
    },
  },
  {
    // ADR-HEARTH-195: the post-"Add all" summary card — Chromecast/Roku/Sonos have no power-on
    // path (skipped) and Yamaha does, so one click of "Test wake for all" shows a mix of skip and
    // pass/fail rows instead of N separate post-add screens.
    name: "discover-add-all-followup-wake-test",
    screen: "discover",
    assertFit: false,
    settleMs: 2500,
    steps: async (page) => {
      await page.getByText("Add all 4", { exact: true }).click();
      await page.waitForTimeout(ADD_ALL_FINISHED_MS);
      await page.getByText("Test wake for all", { exact: true }).click();
      await page.waitForTimeout(ADD_ALL_FINISHED_MS);
    },
  },
  {
    name: "discover-unrecognized",
    screen: "discover",
    assertFit: false,
    settleMs: 2500,
    steps: async (page) => {
      await page.getByText(/other devices? — show/).first().click();
      await page.waitForTimeout(TAB_SETTLE_MS);
      await page.mouse.move(200, 500);
      await page.mouse.wheel(0, SCROLL_STEP_PX);
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "brand-picker-search",
    screen: "list",
    assertFit: false,
    steps: async (page) => {
      await page.getByText("Add a Device", { exact: true }).first().click();
      await page.waitForTimeout(TAB_SETTLE_MS);
      await page.getByLabel("Search brands").fill("sammsung");
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  { name: "activity-editor", screen: "activity-editor", assertFit: false },
  {
    name: "activity-editor-schedule",
    screen: "activity-scheduled",
    assertFit: false,
    steps: async (page) => {
      await page.getByText("Schedule (optional)", { exact: true }).scrollIntoViewIfNeeded();
      await page.getByLabel("Add a schedule").click();
      await page.getByLabel("Fri").last().click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "activity-editor-ha-webhook",
    screen: "activity-editor",
    assertFit: false,
    steps: async (page) => {
      await page.getByText("Home Assistant", { exact: true }).scrollIntoViewIfNeeded();
      await page.getByRole("switch").first().click();
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  { name: "ha-assist", screen: "ha-assist", assertFit: false },
  { name: "fcc-settings", screen: "fcc-settings", assertFit: false },
  // ADR-HEARTH-196 investigation: fcc-settings with a large, varied device list (the "types"
  // household -- 8 extras plus every Home Assistant entity kind plus 2 Ring cameras, 15+ devices
  // spanning tv/streaming/audio/lighting/outlet/camera/gaming/vacuum/feeder/climate/fan/cover/
  // lock/sensor/action) instead of the small 6-device default, to try to reproduce the live
  // settings-gear crash a small fixture doesn't hit.
  { name: "fcc-settings-large-household", screen: "fcc-settings", query: `&${TYPES_QUERY}`, assertFit: false },
  {
    name: "fcc-settings-activity",
    screen: "fcc-settings",
    assertFit: false,
    steps: async (page) => {
      await page.getByLabel("This phone is called").fill("Sean's iPhone");
      await page.getByText("Recent activity", { exact: true }).first().scrollIntoViewIfNeeded();
      await page.waitForSelector("text=Sean turned off Den TV");
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "household-phones",
    screen: "fcc-household-phones",
    assertFit: false,
    settleMs: 1200,
    steps: async (page) => {
      await page.waitForSelector("text=Leah's iPhone");
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "household-phones-guest-invite",
    screen: "fcc-household-phones",
    assertFit: false,
    settleMs: 1200,
    steps: async (page) => {
      await page.waitForSelector("text=Leah's iPhone");
      await page.getByText("Create guest invite", { exact: true }).click();
      await page.waitForSelector("text=K7M2QX9P");
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "household-remotes",
    screen: "fcc-household-remotes",
    assertFit: false,
    settleMs: 1200,
    steps: async (page) => {
      await page.waitForSelector("text=Bedroom remote");
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "household-remotes-pair",
    screen: "fcc-household-remotes",
    assertFit: false,
    settleMs: 1200,
    steps: async (page) => {
      await page.waitForSelector("text=Bedroom remote");
      await page.getByText("Generate pairing code", { exact: true }).click();
      await page.waitForSelector("text=N5SSXF3R");
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  {
    name: "household-remotes-edit-buttons",
    screen: "fcc-household-remotes",
    assertFit: false,
    settleMs: 1200,
    steps: async (page) => {
      await page.waitForSelector("text=Living room remote");
      await page.getByText("Edit buttons", { exact: true }).first().click();
      await page.waitForSelector("text=Edit buttons: Living room remote");
      await page.getByText("Assign", { exact: true }).first().click();
      await page.waitForSelector("text=Living Room TV");
      await page.waitForTimeout(TAB_SETTLE_MS);
    },
  },
  { name: "post-add",screen: "post-add:lg", assertFit: false },
  { name: "setup-checks", screen: "setup-checks:lg", assertFit: false },
  { name: "add-govee", screen: "add:govee", assertFit: false },
  { name: "add-alexa-plugs", screen: "add:alexa", assertFit: false },
  {
    name: "pairing-card",
    screen: "add:roku",
    assertFit: false,
    steps: async (page) => {
      await page.getByPlaceholder("192.168.1.50").fill("192.168.1.99");
      await page.getByText("Connect", { exact: true }).last().click();
      await page.waitForTimeout(1200);
    },
  },
];
