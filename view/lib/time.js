const TIME_BUCKETS = [
  { key: "today", label: "Today", daysAgo: 0 },
  { key: "yesterday", label: "Yesterday", daysAgo: 1 },
  { key: "week", label: "Last 7 days", daysAgo: 6 },
  { key: "month", label: "Last 30 days", daysAgo: 29 },
];

/**
 * Local midnight, computed on calendar days so DST shifts don't skew it.
 *
 * @param {number} now
 * @param {number} daysAgo
 */
function startOfDay(now, daysAgo) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.getTime();
}

/**
 * @param {number | undefined} timestamp
 * @param {number} [now]
 * @returns {BucketInfo}
 */
export function timeBucket(timestamp, now = Date.now()) {
  if (!timestamp) {
    return { key: "unknown", label: "Unknown", order: TIME_BUCKETS.length + 1 };
  }
  const order = TIME_BUCKETS.findIndex(
    ({ daysAgo }) => timestamp >= startOfDay(now, daysAgo),
  );
  if (order === -1) {
    return { key: "older", label: "Older", order: TIME_BUCKETS.length };
  }
  const { key, label } = TIME_BUCKETS[order];
  return { key, label, order };
}
