import { countUrls } from "./lib/grouping.js";

const VIEW_URL = browser.runtime.getURL("view/index.html");

/** Creation timestamps never change once set, so fetch each only once. */
const createdAtCache = new Map();

/** @param {number} id */
async function createdAt(id) {
  if (!createdAtCache.has(id)) {
    const value = await browser.sessions.getTabValue(id, "createdAt");
    // The background may not have set it yet for a brand-new tab.
    if (value === undefined) {
      return undefined;
    }
    createdAtCache.set(id, value);
  }
  return /** @type {number} */ (createdAtCache.get(id));
}

/**
 * @param {browser.tabs.Tab} tab
 * @returns {Promise<TabInfo>}
 */
async function toTabInfo(tab) {
  const id = tab.id ?? -1;
  return {
    id,
    windowId: tab.windowId ?? -1,
    index: tab.index,
    groupId: tab.groupId ?? -1,
    url: tab.url ?? "",
    title: tab.title ?? "",
    favIconUrl: tab.favIconUrl,
    active: tab.active,
    discarded: tab.discarded ?? false,
    lastAccessed: tab.lastAccessed ?? 0,
    incognito: tab.incognito,
    createdAt: await createdAt(id),
  };
}

/**
 * All tabs in normal windows, except Crosstab views.
 *
 * @returns {Promise<TabData>}
 */
export async function loadTabData() {
  const [windows, currentWindow, groups] = await Promise.all([
    browser.windows.getAll({ populate: true, windowTypes: ["normal"] }),
    browser.windows.getCurrent(),
    browser.tabGroups.query({}),
  ]);

  const allTabs = windows.flatMap((win) => win.tabs ?? []);
  const openIds = new Set(allTabs.map((tab) => tab.id));
  for (const id of createdAtCache.keys()) {
    if (!openIds.has(id)) {
      createdAtCache.delete(id);
    }
  }

  const tabs = await Promise.all(
    allTabs.filter((tab) => !tab.url?.startsWith(VIEW_URL)).map(toTabInfo),
  );

  return {
    tabs,
    urlCounts: countUrls(tabs),
    windowOrder: new Map(windows.map((win, i) => [win.id ?? -1, i])),
    currentWindowId: currentWindow.id ?? -1,
    tabGroups: new Map(groups.map((group) => [group.id, group])),
  };
}

/** @param {TabInfo} tab */
export async function focusTab(tab) {
  await browser.tabs.update(tab.id, { active: true });
  await browser.windows.update(tab.windowId, { focused: true });
}

/** @param {TabInfo[]} tabs */
export async function closeTabs(tabs) {
  // Per tab, so one already-closed tab doesn't keep the others open.
  const results = await Promise.allSettled(
    tabs.map((tab) => browser.tabs.remove(tab.id)),
  );
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Some tabs could not be closed");
  }
}

/** @param {() => void} listener Called on any change to tabs, windows, or tab groups. */
export function onTabDataChanged(listener) {
  browser.tabs.onUpdated.addListener(listener, {
    properties: ["discarded", "favIconUrl", "groupId", "title", "url"],
  });
  for (const event of [
    browser.tabs.onCreated,
    browser.tabs.onRemoved,
    browser.tabs.onMoved,
    browser.tabs.onAttached,
    browser.tabs.onActivated,
    browser.windows.onRemoved,
    browser.tabGroups.onCreated,
    browser.tabGroups.onUpdated,
    browser.tabGroups.onRemoved,
    browser.tabGroups.onMoved,
  ]) {
    event.addListener(listener);
  }
}
