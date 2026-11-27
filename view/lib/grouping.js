import { timeBucket } from "./time.js";
import { domainOf, duplicateKey } from "./url.js";

/** @type {Record<string, string>} */
export const GROUP_COLORS = {
  blue: "#0090ed",
  purple: "#9059ff",
  cyan: "#00b3f4",
  orange: "#e27f2e",
  yellow: "#c9a400",
  pink: "#e31587",
  green: "#2ac3a2",
  gray: "#8f8f9d",
  red: "#e22850",
};

/** @typedef {Pick<TabData, "windowOrder" | "currentWindowId" | "tabGroups"> & {now?: number}} GroupingContext */

/** @type {Record<string, (tab: TabInfo, context: GroupingContext) => BucketInfo>} */
export const GROUPINGS = {
  window(tab, { windowOrder, currentWindowId }) {
    const order = windowOrder.get(tab.windowId) ?? 0;
    const notes = [
      ...(tab.incognito ? ["Private"] : []),
      ...(tab.windowId === currentWindowId ? ["Current"] : []),
    ];
    const suffix = notes.length ? ` (${notes.join(", ")})` : "";
    return {
      key: tab.windowId,
      label: `Window ${order + 1}${suffix}`,
      order,
      current: tab.windowId === currentWindowId,
    };
  },
  domain(tab) {
    const domain = domainOf(tab.url);
    return { key: domain, label: domain, domain };
  },
  domainWindow: (tab, context) => GROUPINGS.domain(tab, context),
  tabGroup(tab, { tabGroups, windowOrder }) {
    const group = tabGroups.get(tab.groupId);
    if (!group) {
      return { key: -1, label: "Ungrouped", order: Infinity };
    }
    return {
      key: group.id,
      label: group.title || "Unnamed group",
      color: GROUP_COLORS[group.color],
      order: windowOrder.get(group.windowId),
    };
  },
  lastAccessed: (tab, { now }) => timeBucket(tab.lastAccessed, now),
  created: (tab, { now }) => timeBucket(tab.createdAt, now),
};

/**
 * Groupings that subdivide their buckets into sections.
 *
 * @type {Partial<typeof GROUPINGS>}
 */
const SECTIONINGS = {
  domainWindow: GROUPINGS.window,
};

/** Groupings that list tabs per window, where each window's active tab matters. */
export const PER_WINDOW_GROUPINGS = new Set(["window", "domainWindow"]);

/** Groupings whose single-tab buckets are collected into one bucket. */
const COLLECTING = new Set(["domain", "domainWindow"]);

/**
 * @param {Section[]} parts
 * @param {TabInfo[]} sorted
 * @returns {Section[]}
 */
function collectSingles(parts, sorted) {
  const singles = new Set(
    parts.filter((part) => part.tabs.length === 1).map((part) => part.tabs[0]),
  );
  if (singles.size < 2) {
    return parts;
  }
  return [
    ...parts.filter((part) => part.tabs.length > 1),
    {
      key: "(other)",
      label: "Other domains",
      mixed: true,
      tabs: sorted.filter((tab) => singles.has(tab)),
    },
  ];
}

/** @type {Record<string, (context: Pick<TabData, "windowOrder">) => TabComparator>} */
export const SORTERS = {
  recent: () => (a, b) => b.lastAccessed - a.lastAccessed,
  order:
    ({ windowOrder }) =>
    (a, b) =>
      (windowOrder.get(a.windowId) ?? 0) - (windowOrder.get(b.windowId) ?? 0) ||
      a.index - b.index,
  title: () => (a, b) => a.title.localeCompare(b.title),
  url: () => (a, b) => a.url.localeCompare(b.url),
};

/**
 * @template T, K
 * @param {Iterable<T>} items
 * @param {(item: T) => K} keyOf
 * @returns {Map<K, number>}
 */
export function countBy(items, keyOf) {
  const counts = new Map();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Partitions tabs, keeping their order within each part. Parts are ordered
 * by their `order`, or else largest first.
 *
 * @param {TabInfo[]} tabs
 * @param {(tab: TabInfo) => BucketInfo} infoOf
 * @returns {Section[]}
 */
function partition(tabs, infoOf) {
  /** @type {Map<string | number, Section>} */
  const byKey = new Map();
  for (const tab of tabs) {
    const info = infoOf(tab);
    let part = byKey.get(info.key);
    if (!part) {
      part = { ...info, tabs: [] };
      byKey.set(info.key, part);
    }
    part.tabs.push(tab);
  }
  return [...byKey.values()].sort(
    (a, b) =>
      (a.order ?? 0) - (b.order ?? 0) ||
      b.tabs.length - a.tabs.length ||
      a.label.localeCompare(b.label),
  );
}

/**
 * @param {TabInfo[]} tabs
 * @param {object} options
 * @param {string} options.groupBy
 * @param {string} options.sortBy
 * @param {Map<number, number> | null} [options.ranks] Previous row positions to keep, if any.
 * @param {GroupingContext} context
 * @returns {Bucket[]}
 */
export function groupTabs(tabs, { groupBy, sortBy, ranks = null }, context) {
  const sorter = SORTERS[sortBy](context);
  /** @type {TabComparator} */
  const comparator = ranks
    ? (a, b) =>
        (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity) ||
        sorter(a, b)
    : sorter;
  const sorted = tabs.toSorted(comparator);

  const sectionOf = SECTIONINGS[groupBy];
  let parts = partition(sorted, (tab) => GROUPINGS[groupBy](tab, context));
  if (COLLECTING.has(groupBy)) {
    parts = collectSingles(parts, sorted);
  }
  return parts.map((part) => {
    const id = `${groupBy}:${part.key}`;
    if (!sectionOf) {
      return { ...part, id };
    }
    const sections = partition(part.tabs, (tab) => sectionOf(tab, context));
    return {
      ...part,
      id,
      sections,
      tabs: sections.flatMap((section) => section.tabs),
    };
  });
}

/**
 * Tabs per `duplicateKey()`. Internal pages like `about:newtab` are not counted.
 *
 * @param {TabInfo[]} tabs
 */
export function countUrls(tabs) {
  return countBy(
    tabs.filter((tab) => !tab.url.startsWith("about:")),
    (tab) => duplicateKey(tab.url),
  );
}

/**
 * Domains with the most tabs, then by name.
 *
 * @param {TabInfo[]} tabs
 * @returns {[domain: string, count: number][]}
 */
export function domainOptions(tabs) {
  return [...countBy(tabs, (tab) => domainOf(tab.url))].sort(
    ([a, m], [b, n]) => n - m || a.localeCompare(b),
  );
}
