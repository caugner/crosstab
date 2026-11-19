import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assignColumns,
  COLLAPSED_LIMIT,
  columnCount,
  estimatedRows,
  isCollapsible,
  rankTabs,
  visibleSections,
  visibleTabs,
} from "../view/lib/layout.js";
import { makeBucket, makeTabs } from "./helpers.js";

test("columnCount", async (t) => {
  const cases = [
    { width: 0, expected: 1 },
    { width: 299, expected: 1 },
    { width: 615, expected: 1 },
    { width: 616, expected: 2 },
    { width: 932, expected: 3 },
  ];
  for (const { width, expected } of cases) {
    await t.test(`${width}px`, () => {
      assert.equal(columnCount(width, 300, 16), expected);
    });
  }
});

test("collapsing", async (t) => {
  const cases = [
    { tabs: 1, expanded: false, collapsible: false, visible: 1, rows: 3 },
    {
      // Hiding a single tab behind the toggle would save no space.
      tabs: COLLAPSED_LIMIT + 1,
      expanded: false,
      collapsible: false,
      visible: COLLAPSED_LIMIT + 1,
      rows: COLLAPSED_LIMIT + 3,
    },
    {
      tabs: COLLAPSED_LIMIT + 2,
      expanded: false,
      collapsible: true,
      visible: COLLAPSED_LIMIT,
      rows: COLLAPSED_LIMIT + 3,
    },
    {
      tabs: COLLAPSED_LIMIT + 2,
      expanded: true,
      collapsible: true,
      visible: COLLAPSED_LIMIT + 2,
      rows: COLLAPSED_LIMIT + 4,
    },
  ];
  for (const { tabs, expanded, collapsible, visible, rows } of cases) {
    await t.test(`${tabs} tabs, ${expanded ? "expanded" : "collapsed"}`, () => {
      const bucket = makeBucket("a", tabs);
      assert.equal(isCollapsible(bucket), collapsible);
      assert.equal(visibleTabs(bucket, expanded).length, visible);
      assert.equal(estimatedRows(bucket, expanded), rows);
    });
  }
});

test("visibleSections", async (t) => {
  const first = makeTabs(8);
  const second = makeTabs(3);
  const third = makeTabs(4);
  const bucket = {
    ...makeBucket("a", 0),
    tabs: [...first, ...second, ...third],
    sections: [
      { key: 1, label: "Window 1", tabs: first },
      { key: 2, label: "Window 2", tabs: second },
      { key: 3, label: "Window 3", tabs: third },
    ],
  };

  await t.test("cuts off after the last visible tab", () => {
    assert.deepEqual(
      visibleSections(bucket, false).map(({ label, tabs }) => [label, tabs]),
      [
        ["Window 1", first],
        ["Window 2", second.slice(0, 2)],
      ],
    );
    assert.equal(estimatedRows(bucket, false), 2 + 2 + COLLAPSED_LIMIT + 1);
  });

  await t.test("shows all sections when expanded", () => {
    assert.deepEqual(visibleSections(bucket, true), bucket.sections);
    assert.equal(estimatedRows(bucket, true), 2 + 3 + 15);
  });

  await t.test("is empty for buckets without sections", () => {
    assert.deepEqual(visibleSections(makeBucket("b", 3), false), []);
  });
});

test("assignColumns", async (t) => {
  const none = new Set();

  await t.test("fills the shortest column first", () => {
    const buckets = [
      makeBucket("a", 5),
      makeBucket("b", 1),
      makeBucket("c", 1),
      makeBucket("d", 1),
    ];
    assert.deepEqual(assignColumns(buckets, { count: 2, expanded: none }), [
      ["a"],
      ["b", "c", "d"],
    ]);
  });

  await t.test("keeps empty columns", () => {
    assert.deepEqual(
      assignColumns([makeBucket("a", 1)], { count: 3, expanded: none }),
      [["a"], [], []],
    );
  });

  await t.test("accounts for expanded buckets", () => {
    const buckets = [
      makeBucket("a", 30),
      makeBucket("b", 12),
      makeBucket("c", 1),
    ];
    assert.deepEqual(assignColumns(buckets, { count: 2, expanded: none }), [
      ["a", "c"],
      ["b"],
    ]);
    assert.deepEqual(
      assignColumns(buckets, { count: 2, expanded: new Set(["a"]) }),
      [["a"], ["b", "c"]],
    );
  });

  await t.test(
    "keeps previous placement, drops gone buckets, and adds new ones",
    () => {
      const buckets = [
        makeBucket("new", 1),
        makeBucket("b", 1),
        makeBucket("a", 8),
      ];
      const previous = [["a", "gone"], ["b"]];
      assert.deepEqual(
        assignColumns(buckets, { count: 2, expanded: none, previous }),
        [["a"], ["b", "new"]],
      );
    },
  );
});

test("rankTabs maps tabs to their row within the bucket", () => {
  const a = makeBucket("a", 2);
  const b = makeBucket("b", 1);
  assert.deepEqual(
    [...rankTabs([a, b])],
    [
      [a.tabs[0].id, 0],
      [a.tabs[1].id, 1],
      [b.tabs[0].id, 0],
    ],
  );
});
