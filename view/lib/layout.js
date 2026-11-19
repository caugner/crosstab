export const COLLAPSED_LIMIT = 10;

/**
 * @param {number} width
 * @param {number} minWidth
 * @param {number} gap
 */
export function columnCount(width, minWidth, gap) {
  return Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
}

/**
 * A toggle hiding a single tab would take up the row that tab needs.
 *
 * @param {Bucket} bucket
 */
export function isCollapsible(bucket) {
  return bucket.tabs.length > COLLAPSED_LIMIT + 1;
}

/**
 * @param {Bucket} bucket
 * @param {boolean} expanded
 */
export function visibleTabs(bucket, expanded) {
  return isCollapsible(bucket) && !expanded
    ? bucket.tabs.slice(0, COLLAPSED_LIMIT)
    : bucket.tabs;
}

/**
 * The bucket's sections, cut off after the last visible tab.
 *
 * @param {Bucket} bucket
 * @param {boolean} expanded
 * @returns {Section[]}
 */
export function visibleSections(bucket, expanded) {
  let remaining = visibleTabs(bucket, expanded).length;
  const sections = [];
  for (const section of bucket.sections ?? []) {
    if (!remaining) {
      break;
    }
    const tabs = section.tabs.slice(0, remaining);
    remaining -= tabs.length;
    sections.push({ ...section, tabs });
  }
  return sections;
}

/**
 * Card height in rows: heading, padding, section headings, tabs, and the
 * toggle if any.
 *
 * @param {Bucket} bucket
 * @param {boolean} expanded
 */
export function estimatedRows(bucket, expanded) {
  const toggle = isCollapsible(bucket) && !expanded ? 1 : 0;
  return (
    2 +
    visibleSections(bucket, expanded).length +
    visibleTabs(bucket, expanded).length +
    toggle
  );
}

/**
 * Distributes buckets over columns, each going to the shortest column.
 *
 * @param {Bucket[]} buckets
 * @param {object} options
 * @param {number} options.count
 * @param {Set<string>} options.expanded IDs of expanded buckets.
 * @param {string[][] | null} [options.previous] Columns whose buckets stay in place.
 * @returns {string[][]} Bucket IDs per column.
 */
export function assignColumns(buckets, { count, expanded, previous = null }) {
  const rows = new Map(
    buckets.map((bucket) => [
      bucket.id,
      estimatedRows(bucket, expanded.has(bucket.id)),
    ]),
  );
  /** @type {string[][]} */
  const columns = previous
    ? previous.map((column) => column.filter((id) => rows.has(id)))
    : Array.from({ length: count }, () => []);
  const placed = new Set(columns.flat());
  const heights = columns.map((column) =>
    column.reduce((sum, id) => sum + (rows.get(id) ?? 0), 0),
  );
  for (const [id, height] of rows) {
    if (placed.has(id)) {
      continue;
    }
    const shortest = heights.indexOf(Math.min(...heights));
    columns[shortest].push(id);
    heights[shortest] += height;
  }
  return columns;
}

/**
 * @param {Bucket[]} buckets
 * @returns {Map<number, number>} Tab ID to row position within its bucket.
 */
export function rankTabs(buckets) {
  const ranks = new Map();
  for (const bucket of buckets) {
    bucket.tabs.forEach((tab, i) => ranks.set(tab.id, i));
  }
  return ranks;
}
