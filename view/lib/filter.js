import { domainOf, duplicateKey } from "./url.js";

export const FILTER_ALL = "";
export const FILTER_DUPLICATES = "duplicates";
const DOMAIN_PREFIX = "domain:";

/** @param {string} domain */
export function domainFilter(domain) {
  return DOMAIN_PREFIX + domain;
}

/**
 * @param {string} filter
 * @returns {string | undefined} The domain of a `domainFilter()`.
 */
export function filteredDomain(filter) {
  return filter.startsWith(DOMAIN_PREFIX)
    ? filter.slice(DOMAIN_PREFIX.length)
    : undefined;
}

/**
 * @param {TabInfo} tab
 * @param {Map<string, number>} urlCounts
 */
export function isDuplicate(tab, urlCounts) {
  return (urlCounts.get(duplicateKey(tab.url)) ?? 0) > 1;
}

/**
 * @param {TabInfo[]} tabs
 * @param {Map<string, number>} urlCounts
 */
export function countDuplicates(tabs, urlCounts) {
  return tabs.filter((tab) => isDuplicate(tab, urlCounts)).length;
}

/**
 * @param {TabInfo} tab
 * @param {string} filter One of the `FILTER_*` values or a `domainFilter()`.
 * @param {Map<string, number>} urlCounts
 */
function matchesFilter(tab, filter, urlCounts) {
  if (filter === FILTER_DUPLICATES) {
    return isDuplicate(tab, urlCounts);
  }
  const domain = filteredDomain(filter);
  return domain === undefined || domainOf(tab.url) === domain;
}

/**
 * @param {TabInfo[]} tabs
 * @param {{query?: string, filter?: string}} criteria
 * @param {Map<string, number>} urlCounts
 */
export function filterTabs(
  tabs,
  { query = "", filter = FILTER_ALL },
  urlCounts,
) {
  const needle = query.toLowerCase();
  return tabs.filter(
    (tab) =>
      matchesFilter(tab, filter, urlCounts) &&
      (!needle ||
        tab.title.toLowerCase().includes(needle) ||
        tab.url.toLowerCase().includes(needle)),
  );
}
