// Each scenario: a file-safe name, the demo ?screen= value, optional in-page steps, and whether the
// no-vertical-scroll assertion is enforced (only the remote pages are tuned to fit, ADR-HEARTH-135).

const TAB_SETTLE_MS = 400;

export const SCENARIOS = [
  { name: "devices-home", screen: "list", assertFit: false },
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
  { name: "activity-editor", screen: "activity-editor", assertFit: false },
  { name: "fcc-settings", screen: "fcc-settings", assertFit: false },
  { name: "post-add", screen: "post-add:lg", assertFit: false },
  { name: "setup-checks", screen: "setup-checks:lg", assertFit: false },
  { name: "add-govee", screen: "add:govee", assertFit: false },
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
