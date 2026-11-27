import {
  countDuplicates,
  domainFilter,
  FILTER_ALL,
  FILTER_DUPLICATES,
  filteredDomain,
  filterTabs,
} from "./lib/filter.js";
import {
  domainOptions,
  GROUPINGS,
  groupTabs,
  SORTERS,
} from "./lib/grouping.js";
import { assignColumns, columnCount, rankTabs } from "./lib/layout.js";
import { preserveFocus } from "./focus.js";
import { readChoice } from "./lib/settings.js";
import { el, LABEL_MODES, renderColumns, renderEmpty } from "./render.js";
import {
  closeTabs,
  focusTab,
  loadTabData,
  onTabDataChanged,
  prepareMerge,
  runMerge,
  undoMerge,
} from "./tabs.js";

const COLUMN_MIN_WIDTH = 300;
const RELOAD_DELAY = 100;
/** Reload at least this often during a steady stream of tab events. */
const RELOAD_MAX_WAIT = 1000;
/** `sessionStorage` key of the layout before the last merge. */
const UNDO_KEY = "mergeUndo";

const state = {
  groupBy: readChoice(localStorage, "groupBy", Object.keys(GROUPINGS)),
  sortBy: readChoice(localStorage, "sortBy", Object.keys(SORTERS)),
  label: readChoice(localStorage, "label", LABEL_MODES),
  query: "",
  filter: FILTER_ALL,
  /** @type {Set<string>} IDs of expanded buckets. */
  expanded: new Set(),
  /** @type {{groupBy: string, columns: string[][], ranks: Map<number, number>} | null} */
  layout: null,
  /** @type {TabData} */
  data: {
    tabs: [],
    mergeableWindows: 1,
    windowOrder: new Map(),
    currentWindowId: -1,
    tabGroups: new Map(),
    urlCounts: new Map(),
  },
};

/**
 * @template {HTMLElement} T
 * @param {string} id
 * @param {new () => T} type
 * @returns {T}
 */
function byId(id, type) {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`Missing <${type.name}> with ID "${id}"`);
  }
  return element;
}

const $cards = byId("cards", HTMLElement);
const $tabCount = byId("tab-count", HTMLElement);
const $duplicatesSep = byId("duplicates-sep", HTMLElement);
const $duplicates = byId("duplicates", HTMLButtonElement);
const $search = byId("search", HTMLInputElement);
const $groupBy = byId("group-by", HTMLSelectElement);
const $sortBy = byId("sort-by", HTMLSelectElement);
const $filter = byId("filter", HTMLSelectElement);
const $label = byId("label", HTMLSelectElement);
const $merge = byId("merge", HTMLButtonElement);
const $mergeGroups = byId("merge-groups", HTMLButtonElement);
const $undoMerge = byId("undo-merge", HTMLButtonElement);

let latestLoad = 0;
async function load() {
  const current = ++latestLoad;
  let data;
  try {
    data = await loadTabData();
  } catch (error) {
    // E.g. a tab closed mid-load; its removal event triggers the next load.
    console.error(error);
    return;
  }
  // A slower, older load must not overwrite newer data.
  if (current !== latestLoad) {
    return;
  }
  state.data = data;
  updateFilter();
  updateMergeButtons();
  render();
}

let pending = 0;
let firstScheduled = 0;
function scheduleLoad() {
  const now = Date.now();
  if (!pending) {
    firstScheduled = now;
  } else if (now - firstScheduled >= RELOAD_MAX_WAIT) {
    return;
  }
  clearTimeout(pending);
  pending = setTimeout(() => {
    pending = 0;
    load();
  }, RELOAD_DELAY);
}

function updateFilter() {
  const { tabs, urlCounts } = state.data;
  const duplicates = countDuplicates(tabs, urlCounts);
  const domains = domainOptions(tabs, filteredDomain(state.filter));

  // Skip the rebuild when unchanged, as it would close an open dropdown.
  const signature = JSON.stringify([duplicates, domains]);
  if ($filter.dataset.signature !== signature) {
    $filter.dataset.signature = signature;
    const domainGroup = el(
      "optgroup",
      { label: "Domain" },
      ...domains.map(
        ([domain, count]) =>
          new Option(`${domain} (${count})`, domainFilter(domain)),
      ),
    );
    $filter.replaceChildren(
      new Option("All", FILTER_ALL),
      new Option(`Duplicates (${duplicates})`, FILTER_DUPLICATES),
      ...(domains.length ? [domainGroup] : []),
    );
  }
  $filter.value = state.filter;
}

function updateMergeButtons() {
  const disabled = state.data.mergeableWindows < 2;
  $merge.disabled = disabled;
  $mergeGroups.disabled = disabled;
  $undoMerge.hidden = sessionStorage.getItem(UNDO_KEY) === null;
}

/**
 * @param {number} count
 * @param {string} noun
 */
function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** @param {boolean} asGroups */
async function mergeWindows(asGroups) {
  const plan = await prepareMerge(asGroups);
  const question = `Merge ${plural(plan.windowCount, "window")} (${plural(plan.tabCount, "tab")}) into this window${asGroups ? " as tab groups" : ""}?`;
  if (!plan.windowCount || !confirm(question)) {
    return;
  }
  // Saved first, so a merge that fails halfway can still be undone.
  sessionStorage.setItem(UNDO_KEY, JSON.stringify(plan.snapshot));
  updateMergeButtons();
  await runMerge(plan);
}

async function undoLastMerge() {
  const saved = sessionStorage.getItem(UNDO_KEY);
  if (saved === null) {
    return;
  }
  sessionStorage.removeItem(UNDO_KEY);
  updateMergeButtons();
  await undoMerge(JSON.parse(saved));
}

/** @param {unknown} error */
function reportError(error) {
  console.error(error);
  scheduleLoad();
}

/**
 * A tab may be gone by the time it is clicked; reload to drop it.
 *
 * @template T
 * @param {(arg: T) => Promise<void>} action
 * @returns {(arg: T) => void}
 */
function orReload(action) {
  return (arg) => {
    action(arg).catch(scheduleLoad);
  };
}

/** @param {string} bucketId */
function toggleExpanded(bucketId) {
  if (!state.expanded.delete(bucketId)) {
    state.expanded.add(bucketId);
  }
  render();
}

/** @param {Node[]} nodes */
function showCards(nodes) {
  preserveFocus($cards, () => $cards.replaceChildren(...nodes));
}

/**
 * While the pointer is over the cards, cards keep their column and rows
 * their order, so a click target never moves under the pointer.
 */
function render({ fresh = false } = {}) {
  const { data, groupBy, sortBy, expanded } = state;
  const gap = parseFloat(getComputedStyle($cards).columnGap) || 0;
  const count = columnCount($cards.clientWidth, COLUMN_MIN_WIDTH, gap);
  const previous =
    !fresh &&
    $cards.matches(":hover") &&
    state.layout?.groupBy === groupBy &&
    state.layout.columns.length === count
      ? state.layout
      : null;

  const tabs = filterTabs(data.tabs, state, data.urlCounts);
  const buckets = groupTabs(
    tabs,
    { groupBy, sortBy, ranks: previous?.ranks },
    data,
  );
  const duplicates = countDuplicates(tabs, data.urlCounts);
  const duplicatesActive = state.filter === FILTER_DUPLICATES;
  $tabCount.textContent = plural(tabs.length, "tab");
  $duplicatesSep.hidden = !duplicates;
  $duplicates.hidden = !duplicates;
  $duplicates.textContent = plural(duplicates, "duplicate");
  $duplicates.setAttribute("aria-pressed", String(duplicatesActive));
  $duplicates.title = duplicatesActive
    ? "Show all tabs"
    : "Show only duplicate tabs";

  if (!buckets.length) {
    state.layout = null;
    showCards([renderEmpty()]);
    return;
  }

  const columns = assignColumns(buckets, {
    count,
    expanded,
    previous: previous?.columns,
  });
  state.layout = { groupBy, columns, ranks: rankTabs(buckets) };

  const bucketsById = new Map(buckets.map((bucket) => [bucket.id, bucket]));
  showCards(
    renderColumns(
      columns.map((column) =>
        column.flatMap((id) => bucketsById.get(id) ?? []),
      ),
      {
        label: state.label,
        expanded,
        urlCounts: data.urlCounts,
        onOpen: orReload(focusTab),
        onClose: orReload(closeTabs),
        onToggle: toggleExpanded,
      },
    ),
  );
}

function renderFresh() {
  render({ fresh: true });
}

$groupBy.value = state.groupBy;
$sortBy.value = state.sortBy;
$label.value = state.label;

$search.addEventListener("input", () => {
  state.query = $search.value.trim();
  renderFresh();
});
$filter.addEventListener("change", () => {
  state.filter = $filter.value;
  renderFresh();
});
$duplicates.addEventListener("click", () => {
  state.filter =
    state.filter === FILTER_DUPLICATES ? FILTER_ALL : FILTER_DUPLICATES;
  $filter.value = state.filter;
  renderFresh();
});
for (const [$select, key] of /** @type {const} */ ([
  [$groupBy, "groupBy"],
  [$sortBy, "sortBy"],
  [$label, "label"],
])) {
  $select.addEventListener("change", () => {
    state[key] = $select.value;
    localStorage.setItem(key, $select.value);
    renderFresh();
  });
}

$merge.addEventListener("click", () => {
  mergeWindows(false).catch(reportError);
});
$mergeGroups.addEventListener("click", () => {
  mergeWindows(true).catch(reportError);
});
$undoMerge.addEventListener("click", () => {
  undoLastMerge().catch(reportError);
});

onTabDataChanged(scheduleLoad);

// Time buckets go stale without tab events, so refresh when returning.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    scheduleLoad();
  }
});
window.addEventListener("focus", scheduleLoad);
window.addEventListener("resize", renderFresh);
$cards.addEventListener("mouseleave", renderFresh);

load();
