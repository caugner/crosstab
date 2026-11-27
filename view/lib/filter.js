import { duplicateKey } from "./url.js";

/**
 * @param {TabInfo} tab
 * @param {Map<string, number>} urlCounts
 */
export function isDuplicate(tab, urlCounts) {
  return (urlCounts.get(duplicateKey(tab.url)) ?? 0) > 1;
}

/**
 * @param {TabInfo[]} tabs
 * @param {TabInfo} tab
 * @returns {TabInfo[]} The tabs other than `tab` with the same URL.
 */
export function otherCopies(tabs, tab) {
  const key = duplicateKey(tab.url);
  return tabs.filter(
    (other) => other.id !== tab.id && duplicateKey(other.url) === key,
  );
}

/**
 * @param {TabInfo[]} tabs
 * @param {Map<string, number>} urlCounts
 */
export function countDuplicates(tabs, urlCounts) {
  return tabs.filter((tab) => isDuplicate(tab, urlCounts)).length;
}

export const DUPLICATE_KEYWORD = "is:duplicate";

/**
 * Splits the `is:duplicate` keyword off a search query.
 *
 * @param {string} query
 */
export function parseQuery(query) {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const rest = words.filter((word) => word.toLowerCase() !== DUPLICATE_KEYWORD);
  return { text: rest.join(" "), duplicatesOnly: rest.length < words.length };
}

/**
 * Adds or removes the `is:duplicate` keyword, keeping the rest of the query.
 *
 * @param {string} query
 */
export function toggleDuplicateKeyword(query) {
  const { text, duplicatesOnly } = parseQuery(query);
  return duplicatesOnly ? text : `${DUPLICATE_KEYWORD} ${text}`.trim();
}

/**
 * @param {TabInfo[]} tabs
 * @param {string} query Search text, optionally with `is:duplicate`.
 * @param {Map<string, number>} urlCounts
 */
export function filterTabs(tabs, query, urlCounts) {
  const { text, duplicatesOnly } = parseQuery(query);
  const needle = text.toLowerCase();
  return tabs.filter(
    (tab) =>
      (!duplicatesOnly || isDuplicate(tab, urlCounts)) &&
      (!needle ||
        tab.title.toLowerCase().includes(needle) ||
        tab.url.toLowerCase().includes(needle)),
  );
}
