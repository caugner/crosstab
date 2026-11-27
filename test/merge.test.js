import assert from "node:assert/strict";
import { test } from "node:test";

import {
  planMerge,
  planRestore,
  snapshotLayout,
  windowCreateData,
} from "../view/lib/merge.js";

/**
 * @param {number} id
 * @param {Array<number | [number, {pinned?: boolean, groupId?: number}]>} tabs
 */
function win(id, tabs, { incognito = false } = {}) {
  return {
    id,
    incognito,
    geometry: { state: "normal", left: 0, top: 0, width: 800, height: 600 },
    tabs: tabs.map((tab) => {
      const [tabId, props] = Array.isArray(tab) ? tab : [tab, {}];
      return { id: tabId, pinned: false, groupId: -1, ...props };
    }),
  };
}

const pinned = { pinned: true };

test("planMerge", async (t) => {
  const cases = [
    {
      name: "single window",
      windows: [win(1, [10, 11])],
      options: { targetWindowId: 1, viewTabId: 11 },
      expected: [{ type: "moveTabs", tabIds: [11], index: 0 }],
    },
    {
      name: "unknown target",
      windows: [win(1, [10])],
      options: { targetWindowId: 9 },
      expected: [],
    },
    {
      name: "view tab moves after pinned tabs",
      windows: [win(1, [[10, pinned], 11, 12])],
      options: { targetWindowId: 1, viewTabId: 12 },
      expected: [{ type: "moveTabs", tabIds: [12], index: 1 }],
    },
    {
      name: "pinned view tab stays",
      windows: [win(1, [[10, pinned], 11])],
      options: { targetWindowId: 1, viewTabId: 10 },
      expected: [],
    },
    {
      name: "other windows in order",
      windows: [win(1, [10, 11]), win(2, [20]), win(3, [30, 31])],
      options: { targetWindowId: 2 },
      expected: [
        { type: "moveTabs", tabIds: [10, 11], index: -1 },
        { type: "moveTabs", tabIds: [30, 31], index: -1 },
      ],
    },
    {
      name: "pinned tabs go after the target's pinned tabs",
      windows: [
        win(1, [[10, pinned], 11]),
        win(2, [[20, pinned], [21, pinned], 22]),
        win(3, [[30, pinned]]),
      ],
      options: { targetWindowId: 1 },
      expected: [
        { type: "moveTabs", tabIds: [20, 21], index: 1 },
        { type: "moveTabs", tabIds: [22], index: -1 },
        { type: "moveTabs", tabIds: [30], index: 3 },
      ],
    },
    {
      name: "existing groups move whole, between ungrouped runs",
      windows: [
        win(1, [10]),
        win(2, [20, [21, { groupId: 5 }], [22, { groupId: 5 }], 23]),
      ],
      options: { targetWindowId: 1 },
      expected: [
        { type: "moveTabs", tabIds: [20], index: -1 },
        { type: "moveGroup", groupId: 5 },
        { type: "moveTabs", tabIds: [23], index: -1 },
      ],
    },
    {
      name: "private windows stay separate",
      windows: [win(1, [10]), win(2, [20], { incognito: true }), win(3, [30])],
      options: { targetWindowId: 1 },
      expected: [{ type: "moveTabs", tabIds: [30], index: -1 }],
    },
    {
      name: "as groups: every window's ungrouped tabs, except the view tab",
      windows: [win(1, [10, 11, 12]), win(2, [20, 21])],
      options: { targetWindowId: 1, viewTabId: 11, asGroups: true },
      expected: [
        { type: "moveTabs", tabIds: [11], index: 0 },
        { type: "group", tabIds: [10, 12], title: "Window 1", color: "blue" },
        { type: "group", tabIds: [20, 21], title: "Window 2", color: "purple" },
      ],
    },
    {
      name: "as groups: existing groups and pinned tabs are kept",
      windows: [
        win(1, [[10, { groupId: 4 }]]),
        win(2, [[20, pinned], [21, { groupId: 5 }], 22, 23]),
      ],
      options: { targetWindowId: 1, asGroups: true },
      expected: [
        { type: "moveTabs", tabIds: [20], index: 0 },
        { type: "moveGroup", groupId: 5 },
        { type: "group", tabIds: [22, 23], title: "Window 2", color: "blue" },
      ],
    },
  ];
  for (const { name, windows, options, expected } of cases) {
    await t.test(name, () => {
      const plan = planMerge(windows, { asGroups: false, ...options });
      assert.deepEqual(plan.steps, expected);
    });
  }
});

test("planMerge counts merged windows, tabs, and groups", async (t) => {
  const windows = [
    win(1, [10]),
    win(2, [[20, { groupId: 5 }], 21]),
    win(3, [[30, pinned]]),
  ];
  for (const { asGroups, groupCount } of [
    { asGroups: false, groupCount: 1 },
    { asGroups: true, groupCount: 2 },
  ]) {
    await t.test(`asGroups: ${asGroups}`, () => {
      const plan = planMerge(windows, { targetWindowId: 1, asGroups });
      assert.deepEqual(
        {
          windowCount: plan.windowCount,
          tabCount: plan.tabCount,
          groupCount: plan.groupCount,
        },
        { windowCount: 2, tabCount: 3, groupCount },
      );
    });
  }
});

test("snapshotLayout keeps the target's privacy and their groups", () => {
  const windows = [
    win(1, [[10, { groupId: 4 }]]),
    win(2, [[20, { groupId: 5 }]], { incognito: true }),
  ];
  const groups = [
    { id: 4, windowId: 1, title: "Work", color: "red", collapsed: true },
    { id: 5, windowId: 2, title: "", color: "blue", collapsed: false },
  ];
  assert.deepEqual(snapshotLayout(windows, groups, 1), {
    targetWindowId: 1,
    windows: [windows[0]],
    groups: [{ id: 4, title: "Work", color: "red", collapsed: true }],
  });
});

test("planRestore", async (t) => {
  const snapshot = {
    targetWindowId: 1,
    windows: [
      win(1, [10, 11]),
      win(2, [[20, pinned], [21, { groupId: 5 }], [22, { groupId: 5 }], 23]),
      win(3, [30]),
    ],
    groups: [{ id: 5, title: "Work", color: "red", collapsed: true }],
  };
  const window2 = {
    windowId: undefined,
    createData: windowCreateData(snapshot.windows[1]),
    pinnedTabIds: [20],
    unpinnedTabIds: [21, 22, 23],
    groups: [
      { tabIds: [21, 22], title: "Work", color: "red", collapsed: true },
    ],
  };
  const window3 = {
    windowId: undefined,
    createData: windowCreateData(snapshot.windows[2]),
    pinnedTabIds: [],
    unpinnedTabIds: [30],
    groups: [],
  };
  const target = {
    windowId: 1,
    createData: windowCreateData(snapshot.windows[0]),
    pinnedTabIds: [],
    unpinnedTabIds: [10, 11],
    groups: [],
  };
  const all = [10, 11, 20, 21, 22, 23, 30];
  const cases = [
    {
      name: "all tabs open, target last",
      tabIds: all,
      expected: [window2, window3, target],
    },
    {
      name: "tabs opened since are ignored",
      tabIds: [...all, 40, 41],
      expected: [window2, window3, target],
    },
    {
      name: "closed tabs are skipped",
      tabIds: [10, 11, 20, 22, 23, 30],
      expected: [
        {
          ...window2,
          unpinnedTabIds: [22, 23],
          groups: [{ ...window2.groups[0], tabIds: [22] }],
        },
        window3,
        target,
      ],
    },
    {
      name: "window without open tabs is not recreated",
      tabIds: [10, 11, 20, 21, 22, 23],
      expected: [window2, target],
    },
    {
      name: "closed target window is recreated",
      tabIds: all,
      windowIds: [],
      expected: [window2, window3, { ...target, windowId: undefined }],
    },
  ];
  for (const { name, tabIds, windowIds = [1], expected } of cases) {
    await t.test(name, () => {
      const live = { tabIds: new Set(tabIds), windowIds: new Set(windowIds) };
      assert.deepEqual(planRestore(snapshot, live), expected);
    });
  }
});

test("windowCreateData", async (t) => {
  const geometry = { left: 1, top: 2, width: 3, height: 4 };
  const cases = [
    {
      name: "normal keeps position and size",
      state: "normal",
      expected: { incognito: false, ...geometry },
    },
    {
      name: "maximized drops position and size",
      state: "maximized",
      expected: { incognito: false, state: "maximized" },
    },
  ];
  for (const { name, state, expected } of cases) {
    await t.test(name, () => {
      const data = windowCreateData({
        id: 1,
        incognito: false,
        geometry: { state, ...geometry },
        tabs: [],
      });
      assert.deepEqual(data, expected);
    });
  }
});
