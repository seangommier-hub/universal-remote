// Usage: node scripts/ui-verify/run.mjs [--no-build] [--only=name,name]
// Exports the web bundle, serves it, opens each demo scenario at iPhone 17 size (393x852 @3x),
// saves PNGs to scripts/ui-verify/out/ and prints PASS/FAIL for the no-vertical-scroll check.
import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { measureInPage, verdictLine } from "./measureOverflow.mjs";
import { SCENARIOS } from "./scenarios.mjs";
import { serveDirectory } from "./staticServer.mjs";

// UI_VERIFY_VIEWPORT=430x932 re-runs every scenario at another device size (iPhone Pro vs. Pro Max, SE, ...).
const [VIEWPORT_WIDTH, VIEWPORT_HEIGHT] = (process.env.UI_VERIFY_VIEWPORT ?? "393x852").split("x").map(Number);
const VIEWPORT = { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT };
const DEVICE_SCALE_FACTOR = 3;
const DEFAULT_SETTLE_MS = 1500;
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const OUT_DIR = join(HERE, "out", process.env.UI_VERIFY_VIEWPORT ?? "");
const DIST_DIR = join(HERE, "out", "web-dist"); // shared across viewports so one build serves every UI_VERIFY_VIEWPORT run

function buildWebExport() {
  rmSync(DIST_DIR, { recursive: true, force: true });
  execSync(`npx expo export -p web --output-dir "${DIST_DIR}"`, { cwd: REPO_ROOT, stdio: "inherit", env: { ...process.env, CI: "1", EXPO_NO_TELEMETRY: "1" } });
}

async function runScenario(browser, baseUrl, scenario) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  await page.goto(`${baseUrl}/?demo=1&screen=${encodeURIComponent(scenario.screen)}${scenario.query ?? ""}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(scenario.settleMs ?? DEFAULT_SETTLE_MS);
  if (scenario.steps) await scenario.steps(page).catch((error) => problems.push(`step failed: ${String(error.message).split("\n")[0]}`));
  await page.screenshot({ path: join(OUT_DIR, `${scenario.name}.png`) });
  const measurement = await page.evaluate(measureInPage);
  await context.close();
  return { measurement, problems };
}

async function main() {
  const only = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
  mkdirSync(OUT_DIR, { recursive: true });
  if (!process.argv.includes("--no-build")) buildWebExport();
  const server = await serveDirectory(DIST_DIR);
  const browser = await chromium.launch();
  let failures = 0;
  for (const scenario of SCENARIOS.filter((s) => only.length === 0 || only.includes(s.name))) {
    const { measurement, problems } = await runScenario(browser, server.url, scenario);
    const line = verdictLine(scenario.name, measurement);
    const enforced = scenario.assertFit && line.startsWith("FAIL");
    if (enforced) failures += 1;
    console.log(scenario.assertFit ? line : `INFO  ${line.slice(6)}`);
    problems.forEach((p) => console.log(`      ${p}`));
  }
  await browser.close();
  server.close();
  console.log(`Screenshots: ${OUT_DIR}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
