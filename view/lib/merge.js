import { GROUP_COLORS } from "./grouping.js";

const COLORS = Object.keys(GROUP_COLORS);
const NO_GROUP = -1;

/**
 * Steps that move every tab of the windows sharing the target's privacy into
 * the target window, keeping window and tab order.
 *
 * @param {LayoutWindow[]} windows All windows, in window-list order.
 * @param {{targetWindowId: number, viewTabId?: number, asGroups: boolean}} options
 * @returns {MergePlan}
 */
export function planMerge(windows, { targetWindowId, viewTabId, asGroups }) {
  const target = windows.find((win) => win.id === targetWindowId);
  if (!target) {
    return { steps: [], windowCount: 0, tabCount: 0, groupCount: 0 };
  }
  const sources = windows.filter(
    (win) => win.id !== target.id && win.incognito === target.incognito,
  );

  /** @type {MergeStep[]} */
  const steps = [];
  let colorIndex = 0;
  /**
   * @param {LayoutWindow} win
   * @param {number[]} tabIds
   * @returns {MergeStep}
   */
  const newGroup = (win, tabIds) => ({
    type: "group",
    tabIds,
    title: `Window ${windows.indexOf(win) + 1}`,
    color: COLORS[colorIndex++ % COLORS.length],
  });

  // Firefox silently ignores moves across the pinned/unpinned boundary, so
  // pinned and first-unpinned positions must be exact.
  let pinnedCount = target.tabs.filter((tab) => tab.pinned).length;

  const viewTab = target.tabs.find((tab) => tab.id === viewTabId);
  if (viewTab && !viewTab.pinned) {
    steps.push({ type: "moveTabs", tabIds: [viewTab.id], index: pinnedCount });
  }
  if (asGroups) {
    const ungrouped = target.tabs
      .filter(
        (tab) => !tab.pinned && tab.groupId === NO_GROUP && tab !== viewTab,
      )
      .map((tab) => tab.id);
    if (ungrouped.length) {
      steps.push(newGroup(target, ungrouped));
    }
  }

  const sourceStart = steps.length;
  for (const win of sources) {
    const pinned = win.tabs.filter((tab) => tab.pinned).map((tab) => tab.id);
    if (pinned.length) {
      steps.push({ type: "moveTabs", tabIds: pinned, index: pinnedCount });
      pinnedCount += pinned.length;
    }

    const unpinned = win.tabs.filter((tab) => !tab.pinned);
    const ungrouped = unpinned
      .filter((tab) => tab.groupId === NO_GROUP)
      .map((tab) => tab.id);
    const movedGroups = new Set();
    /** @type {number[]} */
    let run = [];
    const flush = () => {
      if (run.length) {
        steps.push({ type: "moveTabs", tabIds: run, index: -1 });
        run = [];
      }
    };
    for (const tab of unpinned) {
      if (tab.groupId !== NO_GROUP) {
        if (!movedGroups.has(tab.groupId)) {
          movedGroups.add(tab.groupId);
          flush();
          steps.push({ type: "moveGroup", groupId: tab.groupId });
        }
      } else if (!asGroups) {
        run.push(tab.id);
      } else if (tab.id === ungrouped[0]) {
        steps.push(newGroup(win, ungrouped));
      }
    }
    flush();
  }

  return {
    steps,
    windowCount: sources.length,
    tabCount: sources.reduce((sum, win) => sum + win.tabs.length, 0),
    groupCount: steps
      .slice(sourceStart)
      .filter((step) => step.type === "group" || step.type === "moveGroup")
      .length,
  };
}

/**
 * The layout of the windows a merge changes, for undoing it.
 *
 * @param {LayoutWindow[]} windows
 * @param {browser.tabGroups.TabGroup[]} groups
 * @param {number} targetWindowId
 * @returns {LayoutSnapshot}
 */
export function snapshotLayout(windows, groups, targetWindowId) {
  const target = windows.find((win) => win.id === targetWindowId);
  const involved = windows.filter(
    (win) => win === target || win.incognito === target?.incognito,
  );
  const groupIds = new Set(
    involved.flatMap((win) => win.tabs.map((tab) => tab.groupId)),
  );
  return {
    targetWindowId,
    windows: involved,
    groups: groups
      .filter((group) => groupIds.has(group.id))
      .map(({ id, title, color, collapsed }) => ({
        id,
        title,
        color,
        collapsed,
      })),
  };
}

/**
 * How to put the windows of a snapshot back, skipping tabs closed since.
 * Tabs opened since stay where they are.
 *
 * @param {LayoutSnapshot} snapshot
 * @param {{tabIds: Set<number>, windowIds: Set<number>}} live
 * @returns {RestoreWindow[]}
 */
export function planRestore(snapshot, live) {
  const groupsById = new Map(snapshot.groups.map((group) => [group.id, group]));
  const isTarget = (/** @type {LayoutWindow} */ win) =>
    win.id === snapshot.targetWindowId;
  // The target goes last, after the tabs of other windows have left it.
  const ordered = [
    ...snapshot.windows.filter((win) => !isTarget(win)),
    ...snapshot.windows.filter(isTarget),
  ];
  return ordered.flatMap((win) => {
    const tabs = win.tabs.filter((tab) => live.tabIds.has(tab.id));
    if (!tabs.length) {
      return [];
    }
    /** @type {Map<number, number[]>} */
    const members = new Map();
    for (const tab of tabs) {
      if (groupsById.has(tab.groupId)) {
        members.set(tab.groupId, [...(members.get(tab.groupId) ?? []), tab.id]);
      }
    }
    /** @type {RestoreWindow} */
    const result = {
      windowId:
        isTarget(win) && live.windowIds.has(win.id) ? win.id : undefined,
      createData: windowCreateData(win),
      pinnedTabIds: tabs.filter((tab) => tab.pinned).map((tab) => tab.id),
      unpinnedTabIds: tabs.filter((tab) => !tab.pinned).map((tab) => tab.id),
      groups: [...members].map(([groupId, tabIds]) => {
        const { title, color, collapsed } = /** @type {SavedGroup} */ (
          groupsById.get(groupId)
        );
        return { tabIds, title, color, collapsed };
      }),
    };
    return [result];
  });
}

/**
 * `windows.create()` rejects a position or size unless the state is normal.
 *
 * @param {LayoutWindow} win
 * @returns {WindowCreateData}
 */
export function windowCreateData({ incognito, geometry }) {
  const { state, left, top, width, height } = geometry;
  if (state && state !== "normal") {
    return { incognito, state };
  }
  return { incognito, left, top, width, height };
}
