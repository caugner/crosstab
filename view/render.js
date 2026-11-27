import {
  COLLAPSED_LIMIT,
  isCollapsible,
  visibleSections,
  visibleTabs,
} from "./lib/layout.js";
import { displayPath, displayUrl, duplicateKey } from "./lib/url.js";

const FALLBACK_ICON = "../icons/globe.svg";

/** What to show per tab; the first is the default. */
export const LABEL_MODES = ["title", "url", "both"];

/**
 * @typedef {object} RenderOptions
 * @property {string} label Which of title, URL, or both to show per tab.
 * @property {boolean} markActive Whether to emphasize each window's active tab.
 * @property {Set<string>} expanded IDs of expanded buckets.
 * @property {Map<string, number>} urlCounts
 * @property {(tab: TabInfo) => void} onOpen
 * @property {(tabs: TabInfo[]) => void} onClose
 * @property {(tab: TabInfo) => void} onCloseCopies
 * @property {(bucketId: string) => void} onToggle
 */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Partial<HTMLElementTagNameMap[K]>} [props]
 * @param {...(Node | string)} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/**
 * Marks an element whose focus survives re-rendering, see `preserveFocus()`.
 *
 * @template {HTMLElement} T
 * @param {T} node
 * @param {string} key
 */
function focusable(node, key) {
  node.dataset.focusKey = key;
  return node;
}

/**
 * @param {TabInfo} tab
 * @param {string} mode
 * @param {BucketInfo} bucket
 */
function tabLabel(tab, mode, bucket) {
  // The card heading already names the domain.
  const url =
    bucket.domain === undefined ? displayUrl(tab.url) : displayPath(tab.url);
  if (mode === "url") {
    return el("span", { className: "title", textContent: url });
  }
  const title = el("span", { className: "title", textContent: tab.title });
  if (mode === "both") {
    return el(
      "span",
      { className: "label" },
      el("span", { className: "url", textContent: url }),
      title,
    );
  }
  return title;
}

/** @param {TabInfo} tab */
function favicon(tab) {
  const icon = el("img", {
    src: tab.favIconUrl || FALLBACK_ICON,
    alt: "",
    referrerPolicy: "no-referrer",
    loading: "lazy",
  });
  icon.addEventListener("error", () => (icon.src = FALLBACK_ICON), {
    once: true,
  });
  return icon;
}

/**
 * @param {TabInfo} tab
 * @param {number} copies
 * @param {(tab: TabInfo) => void} onCloseCopies
 */
function duplicateBadge(tab, copies, onCloseCopies) {
  const others = copies - 1;
  const label = `Close ${others} other ${others === 1 ? "tab" : "tabs"} with this URL`;
  const badge = el("button", {
    className: "dup",
    textContent: String(copies),
    title: label,
    ariaLabel: label,
  });
  badge.addEventListener("click", () => onCloseCopies(tab));
  return focusable(badge, `copies:${tab.id}`);
}

/**
 * @param {TabInfo} tab
 * @param {RenderOptions} options
 * @param {BucketInfo} bucket
 */
function tabRow(
  tab,
  { label, markActive, urlCounts, onOpen, onClose, onCloseCopies },
  bucket,
) {
  const classes = ["tab"];
  if (markActive && tab.active) {
    classes.push("active");
  }
  if (tab.discarded) {
    classes.push("discarded");
  }
  const open = el(
    "button",
    { className: classes.join(" "), title: `${tab.title}\n${tab.url}` },
    favicon(tab),
    tabLabel(tab, label, bucket),
  );
  open.addEventListener("click", () => onOpen(tab));

  const close = el("button", {
    className: "close",
    textContent: "×",
    title: "Close tab",
    ariaLabel: `Close ${tab.title}`,
  });
  close.addEventListener("click", () => onClose([tab]));

  const li = el("li", {}, focusable(open, `open:${tab.id}`));
  const copies = urlCounts.get(duplicateKey(tab.url)) ?? 0;
  if (copies > 1) {
    li.append(duplicateBadge(tab, copies, onCloseCopies));
  }
  li.append(focusable(close, `close:${tab.id}`));
  return li;
}

/**
 * @param {Bucket} bucket
 * @param {RenderOptions} options
 */
function cardHeading(bucket, { onClose }) {
  const count = bucket.tabs.length;
  const heading = el("h2");
  if (bucket.color) {
    const dot = el("span", { className: "dot" });
    dot.style.background = bucket.color;
    heading.append(dot);
  }

  const closeAllLabel = `Close all ${count} tabs in "${bucket.label}"`;
  const closeAll = el("button", {
    className: "close close-all",
    textContent: "×",
    title: closeAllLabel,
    ariaLabel: closeAllLabel,
  });
  closeAll.addEventListener("click", () => {
    if (count === 1 || confirm(`Close ${count} tabs in "${bucket.label}"?`)) {
      onClose(bucket.tabs);
    }
  });

  heading.append(
    el("span", {
      className: "name",
      textContent: bucket.label,
      title: bucket.label,
    }),
    el("span", { className: "n", textContent: String(count) }),
    focusable(closeAll, `close-all:${bucket.id}`),
  );
  return heading;
}

/**
 * @param {TabInfo[]} tabs
 * @param {RenderOptions} options
 * @param {BucketInfo} bucket
 */
function tabList(tabs, options, bucket) {
  return el("ul", {}, ...tabs.map((tab) => tabRow(tab, options, bucket)));
}

/**
 * @param {Bucket} bucket
 * @param {boolean} expanded
 * @param {RenderOptions} options
 */
function cardBody(bucket, expanded, options) {
  if (!bucket.sections) {
    return [tabList(visibleTabs(bucket, expanded), options, bucket)];
  }
  return visibleSections(bucket, expanded).flatMap((section) => [
    el("h3", { textContent: section.label }),
    tabList(section.tabs, options, bucket),
  ]);
}

/**
 * @param {Bucket} bucket
 * @param {RenderOptions} options
 */
function card(bucket, options) {
  const expanded = options.expanded.has(bucket.id);
  const section = el(
    "section",
    { className: bucket.current ? "card current" : "card" },
    cardHeading(bucket, options),
    ...cardBody(bucket, expanded, options),
  );

  if (isCollapsible(bucket)) {
    const more = el("button", {
      className: "more",
      textContent: expanded
        ? "Show less"
        : `Show more (${bucket.tabs.length - COLLAPSED_LIMIT})`,
    });
    more.addEventListener("click", () => options.onToggle(bucket.id));
    section.append(focusable(more, `more:${bucket.id}`));
  }
  return section;
}

/**
 * @param {Bucket[][]} columns
 * @param {RenderOptions} options
 */
export function renderColumns(columns, options) {
  return columns.map((column) =>
    el(
      "div",
      { className: "column" },
      ...column.map((bucket) => card(bucket, options)),
    ),
  );
}

export function renderEmpty() {
  return el("p", { className: "empty", textContent: "No matching tabs." });
}
