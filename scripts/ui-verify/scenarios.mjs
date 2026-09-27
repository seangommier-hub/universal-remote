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

export const SCENARIOS = [
  { name: "devices-home", screen: "list", assertFit: false },
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
  { name: "remote-lg", screen: "remote:lg", assertFit: true },
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
  { name: "fcc-settings", screen: "fcc-settings", assertFit: false },
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
  { name: "post-add",screen: "post-add:lg", assertFit: false },
  { name: "setup-checks", screen: "setup-checks:lg", assertFit: false },
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
