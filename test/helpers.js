let nextId = 1;

/** Builds a tab with defaults for everything a test doesn't care about. */
export function makeTab(overrides = {}) {
  const id = nextId++;
  return {
    id,
    windowId: 1,
    index: id,
    groupId: -1,
    url: `https://example.com/${id}`,
    title: `Tab ${id}`,
    active: false,
    discarded: false,
    lastAccessed: 0,
    incognito: false,
    ...overrides,
  };
}

export function makeTabs(count, overrides = {}) {
  return Array.from({ length: count }, () => makeTab(overrides));
}

export function makeBucket(id, tabCount) {
  return { id, key: id, label: id, tabs: makeTabs(tabCount) };
}

export const CONTEXT = {
  windowOrder: new Map([
    [1, 0],
    [2, 1],
  ]),
  currentWindowId: 2,
  tabGroups: new Map([
    [7, { id: 7, windowId: 2, title: "Work", color: "blue" }],
    [8, { id: 8, windowId: 1, title: "", color: "red" }],
  ]),
};
