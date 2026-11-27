import { countUrls } from "./lib/grouping.js";
import {
  planMerge,
  planMirror,
  planRestore,
  snapshotLayout,
} from "./lib/merge.js";

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

  const layout = windows.map(toLayoutWindow);
  const plan = planMerge(layout, {
    targetWindowId: currentWindow.id ?? -1,
    asGroups: true,
  });

  return {
    tabs,
    mergeable: {
      windows: plan.windowCount,
      tabs: plan.tabCount,
      groups: plan.groupCount,
    },
    layout,
    urlCounts: countUrls(tabs),
    windowOrder: new Map(windows.map((win, i) => [win.id ?? -1, i])),
    currentWindowId: currentWindow.id ?? -1,
    tabGroups: new Map(groups.map((group) => [group.id, group])),
  };
}

/**
 * @param {browser.windows.Window} win
 * @returns {LayoutWindow}
 */
function toLayoutWindow({
  id,
  incognito,
  state,
  left,
  top,
  width,
  height,
  tabs,
}) {
  return {
    id: id ?? -1,
    incognito,
    geometry: { state, left, top, width, height },
    tabs: (tabs ?? []).map((tab) => ({
      id: tab.id ?? -1,
      pinned: tab.pinned,
      groupId: tab.groupId ?? -1,
    })),
  };
}

/**
 * Plans merging all windows into the one showing this view.
 *
 * @param {boolean} asGroups Put each window's ungrouped tabs in a tab group.
 */
export async function prepareMerge(asGroups) {
  const [windows, currentWindow, viewTab, groups] = await Promise.all([
    browser.windows.getAll({ populate: true, windowTypes: ["normal"] }),
    browser.windows.getCurrent(),
    browser.tabs.getCurrent(),
    browser.tabGroups.query({}),
  ]);
  const layout = windows.map(toLayoutWindow);
  const targetWindowId = currentWindow.id ?? -1;
  return {
    targetWindowId,
    snapshot: snapshotLayout(layout, groups, targetWindowId),
    ...planMerge(layout, { targetWindowId, viewTabId: viewTab?.id, asGroups }),
  };
}

/**
 * Plans turning the parts into tab groups in the window showing this view.
 *
 * @param {MirrorPart[]} parts
 */
export async function prepareMirror(parts) {
  const [windows, currentWindow, viewTab, groups] = await Promise.all([
    browser.windows.getAll({ populate: true, windowTypes: ["normal"] }),
    browser.windows.getCurrent(),
    browser.tabs.getCurrent(),
    browser.tabGroups.query({}),
  ]);
  const layout = windows.map(toLayoutWindow);
  const targetWindowId = currentWindow.id ?? -1;
  return {
    targetWindowId,
    snapshot: snapshotLayout(layout, groups, targetWindowId),
    ...planMirror(layout, parts, { targetWindowId, viewTabId: viewTab?.id }),
  };
}

/** @param {{targetWindowId: number, steps: MergeStep[]}} plan */
export async function runMerge({ targetWindowId: windowId, steps }) {
  for (const step of steps) {
    switch (step.type) {
      case "moveTabs":
        await browser.tabs.move(step.tabIds, { windowId, index: step.index });
        break;
      case "moveGroup":
        await browser.tabGroups.move(step.groupId, { windowId, index: -1 });
        break;
      case "group": {
        const groupId = await browser.tabs.group({
          tabIds: step.tabIds,
          createProperties: { windowId },
        });
        await browser.tabGroups.update(groupId, {
          title: step.title,
          color: /** @type {browser.tabGroups.Color} */ (step.color),
        });
        break;
      }
    }
  }
}

/**
 * Puts tabs back into their windows and groups as recorded before a merge.
 *
 * @param {LayoutSnapshot} snapshot
 */
export async function undoMerge(snapshot) {
  const [windows, currentWindow] = await Promise.all([
    browser.windows.getAll({ populate: true, windowTypes: ["normal"] }),
    browser.windows.getCurrent(),
  ]);
  const liveTabs = new Map(
    windows.flatMap((win) => win.tabs ?? []).map((tab) => [tab.id ?? -1, tab]),
  );
  const restore = planRestore(snapshot, {
    tabIds: new Set(liveTabs.keys()),
    windowIds: new Set(windows.map((win) => win.id ?? -1)),
  });

  for (const win of restore) {
    const { pinnedTabIds, unpinnedTabIds, groups } = win;
    const tabIds = [...pinnedTabIds, ...unpinnedTabIds];
    await browser.tabs.ungroup(tabIds);
    await Promise.all(
      tabIds
        .filter((id) => liveTabs.get(id)?.pinned !== pinnedTabIds.includes(id))
        .map((id) =>
          browser.tabs.update(id, { pinned: pinnedTabIds.includes(id) }),
        ),
    );

    const windowId =
      win.windowId ??
      (await browser.windows.create({ ...win.createData, tabId: tabIds[0] }))
        .id;
    if (pinnedTabIds.length) {
      await browser.tabs.move(pinnedTabIds, { windowId, index: 0 });
    }
    if (unpinnedTabIds.length) {
      const pinned = await browser.tabs.query({ windowId, pinned: true });
      await browser.tabs.move(unpinnedTabIds, {
        windowId,
        index: pinned.length,
      });
    }

    for (const { tabIds: members, title, color, collapsed } of groups) {
      const groupId = await browser.tabs.group({
        tabIds: members,
        createProperties: { windowId },
      });
      await browser.tabGroups.update(groupId, {
        title,
        color: /** @type {browser.tabGroups.Color} */ (color),
        collapsed,
      });
    }
  }
  if (currentWindow.id !== undefined) {
    await browser.windows.update(currentWindow.id, { focused: true });
  }
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
