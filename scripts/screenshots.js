// Captures the AMO listing screenshots in headless Firefox with demo tabs.
// Needs a build (`npm run build`) and network access for the demo pages.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Builder } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";

import { DAY, DEMO_WINDOWS, SCREENSHOTS } from "../listing/listing.js";

const WIDTH = 1280;
const HEIGHT = 800;
/** Fixed, so the view URL is known before installing. */
const UUID = "6f1b3c1e-6c2a-4a8e-9d3b-c0ffee000001";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const addonId = manifest.browser_specific_settings.gecko.id;
const xpi = `web-ext-artifacts/crosstab-${manifest.version}.zip`;

const options = new firefox.Options()
  .addArguments("-headless")
  .setPreference(
    "extensions.webextensions.uuids",
    JSON.stringify({ [addonId]: UUID }),
  )
  .setPreference("layout.css.devPixelsPerPx", "1.0")
  .setPreference("ui.systemUsesDarkTheme", 0);

const driver = await new Builder()
  .forBrowser("firefox")
  .setFirefoxOptions(options)
  // Chrome context is needed to open the extension page.
  .setFirefoxService(
    new firefox.ServiceBuilder().addArguments("--allow-system-access"),
  )
  .build();

try {
  await driver.installAddon(xpi, true);
  // Marionette refuses to navigate content to extension pages.
  await driver.setContext(firefox.Context.CHROME);
  await driver.executeScript(
    "openTrustedLinkIn(arguments[0], 'current')",
    `moz-extension://${UUID}/view/index.html`,
  );
  await driver.setContext(firefox.Context.CONTENT);
  await driver.wait(
    async () => (await driver.getCurrentUrl()).startsWith("moz-extension:"),
    10_000,
  );

  // Size the window so the viewport, not the outer window, is WIDTH x HEIGHT.
  await driver.manage().window().setRect({ width: WIDTH, height: HEIGHT });
  const [dw, dh] = await driver.executeScript(
    "return [outerWidth - innerWidth, outerHeight - innerHeight]",
  );
  await driver
    .manage()
    .window()
    .setRect({ width: WIDTH + dw, height: HEIGHT + dh });

  await driver.manage().setTimeouts({ script: 60_000 });
  await driver.executeAsyncScript(setupDemo, DEMO_WINDOWS, DAY);
  // The view caches creation times, so reload after faking them.
  await driver.navigate().refresh();

  for (const { file, settings } of SCREENSHOTS) {
    await driver.executeScript(applySettings, settings);
    await driver.sleep(500);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, await driver.takeScreenshot(), "base64");
    console.log(`Saved ${file}`);
  }
} finally {
  await driver.quit();
}

/**
 * Runs in the Crosstab page, which has access to the WebExtension APIs.
 *
 * @param {typeof DEMO_WINDOWS} windows
 * @param {number} day
 * @param {() => void} done
 */
async function setupDemo(windows, day, done) {
  const sleep = (/** @type {number} */ ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  const current = await browser.windows.getCurrent();
  /** @type {{windowId: number, tabIds: number[]}[]} */
  const created = [];
  for (const [i, win] of windows.entries()) {
    const urls = win.tabs.map((tab) => tab.url);
    if (i === 0) {
      const tabs = await Promise.all(
        urls.map((url) =>
          browser.tabs.create({ windowId: current.id, url, active: false }),
        ),
      );
      created.push({
        windowId: current.id ?? -1,
        tabIds: tabs.map((tab) => tab.id ?? -1),
      });
    } else {
      const { id, tabs = [] } = await browser.windows.create({ url: urls });
      created.push({
        windowId: id ?? -1,
        tabIds: tabs.map((tab) => tab.id ?? -1),
      });
    }
  }

  for (let waited = 0; waited < 30_000; waited += 500) {
    const loading = await browser.tabs.query({ status: "loading" });
    if (!loading.length) {
      break;
    }
    await sleep(500);
  }
  // Let the background record its own creation times first.
  await sleep(1000);

  for (const [i, win] of windows.entries()) {
    const { windowId, tabIds } = created[i];
    await Promise.all(
      win.tabs.map((tab, j) =>
        browser.sessions.setTabValue(
          tabIds[j],
          "createdAt",
          Date.now() - tab.age * day - j * 60_000,
        ),
      ),
    );
    for (const group of win.groups ?? []) {
      const groupId = await browser.tabs.group({
        tabIds: group.tabs.map((j) => tabIds[j]),
        createProperties: { windowId },
      });
      await browser.tabGroups.update(groupId, {
        title: group.title,
        color: /** @type {browser.tabGroups.Color} */ (group.color),
      });
    }
  }
  await browser.windows.update(current.id ?? -1, { focused: true });
  done();
}

/**
 * Runs in the Crosstab page.
 *
 * @param {Record<string, string>} settings
 */
function applySettings({ groupBy, sortBy, label }) {
  for (const [id, value] of Object.entries({
    "group-by": groupBy,
    "sort-by": sortBy,
    label,
  })) {
    const select = /** @type {HTMLSelectElement} */ (
      document.getElementById(id)
    );
    select.value = value;
    select.dispatchEvent(new Event("change"));
  }
  /** @type {HTMLElement | null} */ (document.activeElement)?.blur();
}
