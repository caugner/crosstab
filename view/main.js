import {
  countDuplicates,
  DUPLICATE_KEYWORD,
  filterTabs,
  otherCopies,
  parseQuery,
  toggleDuplicateKeyword,
} from "./lib/filter.js";
import {
  domainOptions,
  GROUPINGS,
  groupTabs,
  PER_WINDOW_GROUPINGS,
  SORTERS,
} from "./lib/grouping.js";
import { assignColumns, columnCount, rankTabs } from "./lib/layout.js";
import { planMirror } from "./lib/merge.js";
import { preserveFocus } from "./focus.js";
import { readChoice } from "./lib/settings.js";
import { el, LABEL_MODES, renderColumns, renderEmpty } from "./render.js";
import {
  closeTabs,
  focusTab,
  loadTabData,
  onTabDataChanged,
  prepareMerge,
  prepareMirror,
  runMerge,
  undoMerge,
} from "./tabs.js";

const COLUMN_MIN_WIDTH = 300;
const RELOAD_DELAY = 100;
/** Reload at least this often during a steady stream of tab events. */
const RELOAD_MAX_WAIT = 1000;
/** Search results are announced once typing pauses, then cleared. */
const STATUS_DELAY = 500;
const STATUS_DURATION = 5000;
/** `sessionStorage` key of the layout before the last merge. */
const UNDO_KEY = "mergeUndo";

const state = {
  groupBy: readChoice(localStorage, "groupBy", Object.keys(GROUPINGS)),
  sortBy: readChoice(localStorage, "sortBy", Object.keys(SORTERS)),
  label: readChoice(localStorage, "label", LABEL_MODES),
  query: "",
  /** @type {Set<string>} IDs of expanded buckets. */
  expanded: new Set(),
  /** @type {{groupBy: string, columns: string[][], ranks: Map<number, number>} | null} */
  layout: null,
  /** @type {MirrorPart[]} The shown buckets, for "Mirror grouping". */
  mirrorParts: [],
  /** @type {TabData} */
  data: {
    tabs: [],
    mergeable: { windows: 0, tabs: 0, groups: 0 },
    layout: [],
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
const $searchStatus = byId("search-status", HTMLElement);
const $search = byId("search", HTMLInputElement);
const $searchClear = byId("search-clear", HTMLButtonElement);
const $groupBy = byId("group-by", HTMLSelectElement);
const $sortBy = byId("sort-by", HTMLSelectElement);
const $suggestions = byId("search-suggestions", HTMLDataListElement);
const $label = byId("label", HTMLSelectElement);
const $customize = byId("customize", HTMLButtonElement);
const $customizePanel = byId("customize-panel", HTMLElement);
const $reorganise = byId("reorganise", HTMLButtonElement);
const $reorganiseMenu = byId("reorganise-menu", HTMLElement);
const $reorganiseItems = [...$reorganiseMenu.querySelectorAll("button")];
const $merge = byId("merge", HTMLButtonElement);
const $mergeGroups = byId("merge-groups", HTMLButtonElement);
const $mirror = byId("mirror", HTMLButtonElement);
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
  updateSuggestions();
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

function updateSuggestions() {
  const { tabs, urlCounts } = state.data;
  const suggestions = domainOptions(tabs);
  const duplicates = countDuplicates(tabs, urlCounts);
  if (duplicates) {
    suggestions.unshift([DUPLICATE_KEYWORD, duplicates]);
  }
  // Skip the rebuild when unchanged, as it would close open suggestions.
  const signature = JSON.stringify(suggestions);
  if ($suggestions.dataset.signature !== signature) {
    $suggestions.dataset.signature = signature;
    // Firefox shows only the label, so it must include the value.
    $suggestions.replaceChildren(
      ...suggestions.map(([value, count]) =>
        el("option", { value, label: `${value} (${count})` }),
      ),
    );
  }
}

function updateMergeButtons() {
  const byWindow = state.groupBy === "window";
  $merge.hidden = !byWindow;
  $mergeGroups.hidden = !byWindow;
  $mirror.hidden = byWindow;
  let disabled;
  if (byWindow) {
    const { windows, tabs, groups } = state.data.mergeable;
    disabled = windows === 0;
    $merge.textContent = `Move ${plural(tabs, "tab")} from ${plural(windows, "window")} into this window`;
    $mergeGroups.textContent = `Move ${plural(windows, "window")} (${plural(tabs, "tab")}) into this window as ${plural(groups, "group")}`;
  } else {
    const { tabCount, groupCount } = planMirror(
      state.data.layout,
      state.mirrorParts,
      { targetWindowId: state.data.currentWindowId },
    );
    disabled = groupCount === 0;
    $mirror.textContent = `${mirrorSummary(tabCount, groupCount)} in this window`;
  }
  $reorganise.disabled = disabled;
  if (disabled) {
    $reorganiseMenu.hidePopover();
  }
  $undoMerge.hidden = sessionStorage.getItem(UNDO_KEY) === null;
}

/**
 * @param {number} tabs
 * @param {number} groups
 */
function mirrorSummary(tabs, groups) {
  const grouping = $groupBy.selectedOptions[0].text.toLowerCase();
  return `Group ${plural(tabs, "tab")} by ${grouping} into ${plural(groups, "tab group")}`;
}

/**
 * The buckets as tab groups, keeping existing groups' titles and colors.
 *
 * @param {Bucket[]} buckets
 * @returns {MirrorPart[]}
 */
function toMirrorParts(buckets) {
  return buckets.map((bucket) => {
    const tabIds = bucket.tabs.map((tab) => tab.id);
    if (state.groupBy !== "tabGroup") {
      return { tabIds, title: bucket.label };
    }
    const group = state.data.tabGroups.get(Number(bucket.key));
    return group
      ? { tabIds, title: group.title ?? "", color: group.color }
      : { tabIds };
  });
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
  const question = `Move ${plural(plan.windowCount, "window")} (${plural(plan.tabCount, "tab")}) into this window${asGroups ? ` as ${plural(plan.groupCount, "group")}` : ""}?`;
  if (!plan.windowCount || !confirm(question)) {
    return;
  }
  // Saved first, so a merge that fails halfway can still be undone.
  sessionStorage.setItem(UNDO_KEY, JSON.stringify(plan.snapshot));
  updateMergeButtons();
  await runMerge(plan);
}

async function mirrorGrouping() {
  const plan = await prepareMirror(state.mirrorParts);
  if (
    !plan.groupCount ||
    !confirm(`${mirrorSummary(plan.tabCount, plan.groupCount)} in this window?`)
  ) {
    return;
  }
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

/** @param {TabInfo} tab */
function closeCopies(tab) {
  const copies = otherCopies(state.data.tabs, tab);
  if (
    copies.length === 0 ||
    (copies.length > 1 &&
      !confirm(`Close ${copies.length} other tabs with this URL?`))
  ) {
    return;
  }
  orReload(closeTabs)(copies);
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

/** Whether keyboard focus is in the cards; clicks focus buttons on some OSes. */
function cardsFocused() {
  return $cards.querySelector(":focus-visible") !== null;
}

/**
 * While the pointer or keyboard focus is in the cards, cards keep their column
 * and rows their order, so a target never moves under the pointer or caret.
 */
function render({ fresh = false } = {}) {
  const { data, groupBy, sortBy, expanded } = state;
  $cards.dataset.groupBy = groupBy;
  const gap = parseFloat(getComputedStyle($cards).columnGap) || 0;
  const count = columnCount($cards.clientWidth, COLUMN_MIN_WIDTH, gap);
  const previous =
    !fresh &&
    ($cards.matches(":hover") || cardsFocused()) &&
    state.layout?.groupBy === groupBy &&
    state.layout.columns.length === count
      ? state.layout
      : null;

  const tabs = filterTabs(data.tabs, state.query, data.urlCounts);
  const buckets = groupTabs(
    tabs,
    { groupBy, sortBy, ranks: previous?.ranks },
    data,
  );
  state.mirrorParts = toMirrorParts(buckets);
  updateMergeButtons();
  const duplicates = countDuplicates(tabs, data.urlCounts);
  const windows = new Set(tabs.map((tab) => tab.windowId)).size;
  const groups = new Set(
    tabs.map((tab) => tab.groupId).filter((id) => data.tabGroups.has(id)),
  ).size;
  $tabCount.textContent =
    `${plural(tabs.length, "tab")} on ${plural(windows, "window")}` +
    (groups ? `, ${plural(groups, "group")}` : "");
  $duplicatesSep.hidden = !duplicates;
  $duplicates.hidden = !duplicates;
  $duplicates.textContent = plural(duplicates, "duplicate");
  const { duplicatesOnly } = parseQuery(state.query);
  $duplicates.setAttribute("aria-pressed", String(duplicatesOnly));
  $duplicates.title = duplicatesOnly
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
        markActive: PER_WINDOW_GROUPINGS.has(groupBy),
        expanded,
        urlCounts: data.urlCounts,
        onOpen: orReload(focusTab),
        onClose: orReload(closeTabs),
        onCloseCopies: closeCopies,
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

/** @param {string} value */
function setSearch(value) {
  $search.value = value;
  searchChanged();
}
function searchChanged() {
  state.query = $search.value.trim();
  $searchClear.hidden = !$search.value;
  renderFresh();
  announceResults();
}

let statusTimer = 0;
/** Unlike #count, announced only when the user changes the search. */
function announceResults() {
  clearTimeout(statusTimer);
  $searchStatus.textContent = "";
  statusTimer = setTimeout(() => {
    $searchStatus.textContent = $tabCount.textContent;
    statusTimer = setTimeout(() => {
      $searchStatus.textContent = "";
    }, STATUS_DURATION);
  }, STATUS_DELAY);
}
$search.addEventListener("input", searchChanged);
$searchClear.addEventListener("click", () => {
  setSearch("");
  $search.focus();
});
$duplicates.addEventListener("click", () => {
  setSearch(toggleDuplicateKeyword($search.value));
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

const $customizeClose = byId("customize-close", HTMLButtonElement);

/** @param {boolean} open */
function setCustomizeOpen(open) {
  $customizePanel.classList.toggle("open", open);
  $customizePanel.inert = !open;
  $customize.setAttribute("aria-expanded", String(open));
}
$customize.addEventListener("click", () => {
  const open = $customize.getAttribute("aria-expanded") !== "true";
  setCustomizeOpen(open);
  if (open) {
    $customizeClose.focus();
  }
});
$customizeClose.addEventListener("click", () => {
  setCustomizeOpen(false);
  $customize.focus();
});
document.addEventListener("click", (event) => {
  const target = /** @type {Node} */ (event.target);
  if (!$customizePanel.contains(target) && !$customize.contains(target)) {
    setCustomizeOpen(false);
  }
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    $customize.getAttribute("aria-expanded") === "true"
  ) {
    setCustomizeOpen(false);
    $customize.focus();
  }
});

// Firefox lacks CSS anchor positioning before 147, so align the menu manually.
$reorganiseMenu.addEventListener("beforetoggle", (event) => {
  if (/** @type {ToggleEvent} */ (event).newState === "open") {
    const rect = $reorganise.getBoundingClientRect();
    $reorganiseMenu.style.top = `${rect.bottom + 4}px`;
    $reorganiseMenu.style.right = `${document.documentElement.clientWidth - rect.right}px`;
  }
});
$reorganiseMenu.addEventListener("toggle", (event) => {
  const open = /** @type {ToggleEvent} */ (event).newState === "open";
  $reorganise.setAttribute("aria-expanded", String(open));
  if (open) {
    $reorganiseItems.find(($item) => !$item.hidden)?.focus();
  }
});
$reorganiseMenu.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    // Tab continues from the button, even if a click opened the menu.
    $reorganise.focus();
    $reorganiseMenu.hidePopover();
    return;
  }
  const items = $reorganiseItems.filter(($item) => !$item.hidden);
  const index = items.findIndex(($item) => $item === document.activeElement);
  const next = {
    ArrowDown: (index + 1) % items.length,
    ArrowUp: (index - 1 + items.length) % items.length,
    Home: 0,
    End: items.length - 1,
  }[event.key];
  if (next === undefined) {
    return;
  }
  event.preventDefault();
  items[next].focus();
});
for (const [$item, asGroups] of /** @type {const} */ ([
  [$merge, false],
  [$mergeGroups, true],
])) {
  $item.addEventListener("click", () => {
    $reorganiseMenu.hidePopover();
    mergeWindows(asGroups).catch(reportError);
  });
}
$mirror.addEventListener("click", () => {
  $reorganiseMenu.hidePopover();
  mirrorGrouping().catch(reportError);
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
$cards.addEventListener("mouseleave", () => {
  if (!cardsFocused()) {
    renderFresh();
  }
});
$cards.addEventListener("focusout", () => {
  // Deferred, as re-rendering briefly drops focus before restoring it.
  setTimeout(() => {
    // Not while away, e.g. after activating a tab, to keep rows on return.
    if (document.hasFocus() && !$cards.matches(":hover") && !cardsFocused()) {
      renderFresh();
    }
  });
});

load();
