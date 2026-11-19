import assert from "node:assert/strict";
import { test } from "node:test";

import { timeBucket } from "../view/lib/time.js";

const NOW = new Date(2026, 5, 15, 12).getTime();

test("timeBucket", async (t) => {
  const cases = [
    { name: "missing timestamp", timestamp: undefined, key: "unknown" },
    {
      name: "earlier today",
      timestamp: new Date(2026, 5, 15, 0),
      key: "today",
    },
    { name: "later today", timestamp: new Date(2026, 5, 15, 23), key: "today" },
    {
      name: "end of yesterday",
      timestamp: new Date(2026, 5, 14, 23, 59, 59, 999),
      key: "yesterday",
    },
    {
      name: "start of yesterday",
      timestamp: new Date(2026, 5, 14),
      key: "yesterday",
    },
    { name: "two days ago", timestamp: new Date(2026, 5, 13, 23), key: "week" },
    { name: "six days ago", timestamp: new Date(2026, 5, 9), key: "week" },
    {
      name: "seven days ago",
      timestamp: new Date(2026, 5, 8, 23),
      key: "month",
    },
    { name: "29 days ago", timestamp: new Date(2026, 4, 17), key: "month" },
    { name: "30 days ago", timestamp: new Date(2026, 4, 16, 23), key: "older" },
    // DST starts on 2026-03-29 in Europe and on 2026-03-08 in the US.
    {
      name: "start of yesterday across a DST change",
      timestamp: new Date(2026, 2, 29),
      now: new Date(2026, 2, 30, 12),
      key: "yesterday",
    },
    {
      name: "end of the day before yesterday across a DST change",
      timestamp: new Date(2026, 2, 7, 23, 59),
      now: new Date(2026, 2, 9, 0, 30),
      key: "week",
    },
  ];
  for (const { name, timestamp, now = NOW, key } of cases) {
    await t.test(name, () => {
      assert.equal(timeBucket(timestamp?.valueOf(), now.valueOf()).key, key);
    });
  }

  await t.test("orders buckets from newest to unknown", () => {
    const timestamps = [
      new Date(2026, 5, 15),
      new Date(2026, 5, 14),
      new Date(2026, 5, 10),
      new Date(2026, 5, 1),
      new Date(2025, 0, 1),
      undefined,
    ];
    const orders = timestamps.map(
      (timestamp) => timeBucket(timestamp?.valueOf(), NOW).order,
    );
    assert.deepEqual(orders, [0, 1, 2, 3, 4, 5]);
  });
});
