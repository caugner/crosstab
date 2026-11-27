import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countBy,
  domainOptions,
  GROUP_COLORS,
  GROUPINGS,
  groupTabs,
  SORTERS,
} from "../view/lib/grouping.js";
import { CONTEXT, makeTab } from "./helpers.js";

test("GROUPINGS", async (t) => {
  const now = new Date(2026, 5, 15, 12).getTime();
  const cases = [
    {
      name: "window",
      groupBy: "window",
      tab: { windowId: 1 },
      expected: { key: 1, label: "Window 1", order: 0, current: false },
    },
    {
      name: "current window",
      groupBy: "window",
      tab: { windowId: 2 },
      expected: {
        key: 2,
        label: "Window 2 (Current)",
        order: 1,
        current: true,
      },
    },
    {
      name: "private window",
      groupBy: "window",
      tab: { windowId: 1, incognito: true },
      expected: {
        key: 1,
        label: "Window 1 (Private)",
        order: 0,
        current: false,
      },
    },
    {
      name: "current private window",
      groupBy: "window",
      tab: { windowId: 2, incognito: true },
      expected: {
        key: 2,
        label: "Window 2 (Private, Current)",
        order: 1,
        current: true,
      },
    },
    {
      name: "domain",
      groupBy: "domain",
      tab: { url: "https://www.example.org/a" },
      expected: {
        key: "example.org",
        label: "example.org",
        domain: "example.org",
      },
    },
    {
      name: "tab group ordered by its window",
      groupBy: "tabGroup",
      tab: { groupId: 7 },
      expected: { key: 7, label: "Work", color: GROUP_COLORS.blue, order: 1 },
    },
    {
      name: "untitled tab group",
      groupBy: "tabGroup",
      tab: { groupId: 8 },
      expected: {
        key: 8,
        label: "Unnamed group",
        color: GROUP_COLORS.red,
        order: 0,
      },
    },
    {
      name: "no tab group",
      groupBy: "tabGroup",
      tab: { groupId: -1 },
      expected: { key: -1, label: "Ungrouped", order: Infinity },
    },
    {
      name: "last accessed",
      groupBy: "lastAccessed",
      tab: { lastAccessed: now - 1000 },
      expected: { key: "today", label: "Today", order: 0 },
    },
    {
      name: "created, without a recorded timestamp",
      groupBy: "created",
      tab: {},
      expected: { key: "unknown", label: "Unknown", order: 5 },
    },
  ];
  for (const { name, groupBy, tab, expected } of cases) {
    await t.test(name, () => {
      const actual = GROUPINGS[groupBy](makeTab(tab), { ...CONTEXT, now });
      assert.deepEqual(actual, expected);
    });
  }
});

test("SORTERS", async (t) => {
  const a = makeTab({
    windowId: 2,
    index: 0,
    lastAccessed: 3,
    title: "b",
    url: "https://c",
  });
  const b = makeTab({
    windowId: 1,
    index: 1,
    lastAccessed: 1,
    title: "c",
    url: "https://a",
  });
  const c = makeTab({
    windowId: 1,
    index: 0,
    lastAccessed: 2,
    title: "a",
    url: "https://b",
  });
  const cases = [
    { sortBy: "recent", expected: [a, c, b] },
    { sortBy: "order", expected: [c, b, a] },
    { sortBy: "title", expected: [c, a, b] },
    { sortBy: "url", expected: [b, c, a] },
  ];
  for (const { sortBy, expected } of cases) {
    await t.test(sortBy, () => {
      assert.deepEqual([a, b, c].sort(SORTERS[sortBy](CONTEXT)), expected);
    });
  }
});

test("countBy", () => {
  const counts = countBy(["a", "bb", "c"], (word) => word.length);
  assert.deepEqual(
    [...counts],
    [
      [1, 2],
      [2, 1],
    ],
  );
});

test("groupTabs", async (t) => {
  await t.test("orders buckets by explicit order", () => {
    const tabs = [
      makeTab({ windowId: 2 }),
      makeTab({ windowId: 1 }),
      makeTab({ windowId: 2 }),
    ];
    const buckets = groupTabs(
      tabs,
      { groupBy: "window", sortBy: "order" },
      CONTEXT,
    );
    assert.deepEqual(
      buckets.map(({ id, tabs }) => [id, tabs.length]),
      [
        ["window:1", 1],
        ["window:2", 2],
      ],
    );
  });

  await t.test("orders buckets without order by size, then label", () => {
    const tabs = [
      "https://b.test/1",
      "https://c.test/1",
      "https://a.test/1",
      "https://c.test/2",
      "https://b.test/2",
      "https://a.test/2",
      "https://c.test/3",
    ].map((url) => makeTab({ url }));
    const buckets = groupTabs(
      tabs,
      { groupBy: "domain", sortBy: "order" },
      CONTEXT,
    );
    assert.deepEqual(
      buckets.map(({ id }) => id),
      ["domain:c.test", "domain:a.test", "domain:b.test"],
    );
  });

  await t.test(
    "collects single-tab domains into one last bucket",
    async (t) => {
      const urls = [
        "https://s1.test",
        "https://a.test/1",
        "https://s2.test",
        "https://a.test/2",
      ];
      const [s1, a1, s2, a2] = urls.map((url) => makeTab({ url }));
      const cases = [
        {
          name: "several singles",
          tabs: [s1, a1, s2, a2],
          groupBy: "domain",
          expected: [
            ["domain:a.test", [a1, a2]],
            ["domain:(other)", [s1, s2]],
          ],
        },
        {
          name: "lone single",
          tabs: [s1, a1, a2],
          groupBy: "domain",
          expected: [
            ["domain:a.test", [a1, a2]],
            ["domain:s1.test", [s1]],
          ],
        },
        {
          name: "only singles",
          tabs: [s1, s2],
          groupBy: "domain",
          expected: [["domain:(other)", [s1, s2]]],
        },
        {
          name: "other groupings never collect",
          tabs: [s1, a1, s2, a2],
          groupBy: "window",
          expected: [["window:1", [s1, a1, s2, a2]]],
        },
      ];
      for (const { name, tabs, groupBy, expected } of cases) {
        await t.test(name, () => {
          const buckets = groupTabs(
            tabs,
            { groupBy, sortBy: "order" },
            CONTEXT,
          );
          assert.deepEqual(
            buckets.map(({ id, tabs }) => [id, tabs]),
            expected,
          );
          assert.deepEqual(
            buckets.filter(({ mixed }) => mixed).map(({ label }) => label),
            expected.some(([id]) => id === "domain:(other)")
              ? ["Other domains"]
              : [],
          );
        });
      }
    },
  );

  await t.test("orders collected tabs like the sorted list", () => {
    const [c, a, b] = ["c", "a", "b"].map((title) =>
      makeTab({ title, url: `https://${title}.test` }),
    );
    const buckets = groupTabs(
      [c, a, b],
      { groupBy: "domain", sortBy: "title" },
      CONTEXT,
    );
    assert.deepEqual(buckets[0].tabs, [a, b, c]);
  });

  await t.test("puts ungrouped tabs last", () => {
    const tabs = [makeTab(), makeTab({ groupId: 7 }), makeTab({ groupId: 8 })];
    const buckets = groupTabs(
      tabs,
      { groupBy: "tabGroup", sortBy: "order" },
      CONTEXT,
    );
    assert.deepEqual(
      buckets.map(({ label }) => label),
      ["Unnamed group", "Work", "Ungrouped"],
    );
  });

  await t.test("sorts tabs within a bucket", () => {
    const tabs = [makeTab({ title: "b" }), makeTab({ title: "a" })];
    const [bucket] = groupTabs(
      tabs,
      { groupBy: "window", sortBy: "title" },
      CONTEXT,
    );
    assert.deepEqual(
      bucket.tabs.map(({ title }) => title),
      ["a", "b"],
    );
  });

  await t.test(
    "keeps ranked tabs in place and sorts new ones after them",
    () => {
      const [b, a, d, c] = ["b", "a", "d", "c"].map((title) =>
        makeTab({ title }),
      );
      const ranks = new Map([
        [b.id, 0],
        [a.id, 1],
      ]);
      const [bucket] = groupTabs(
        [d, c, a, b],
        { groupBy: "window", sortBy: "title", ranks },
        CONTEXT,
      );
      assert.deepEqual(bucket.tabs, [b, a, c, d]);
    },
  );

  await t.test("subdivides domains by window, in window order", () => {
    const [a, b, c, d] = [
      { url: "https://a.test/1", windowId: 2, title: "y" },
      { url: "https://a.test/2", windowId: 1, title: "z" },
      { url: "https://a.test/3", windowId: 2, title: "x" },
      { url: "https://b.test/1", windowId: 2, title: "w" },
    ].map(makeTab);
    const buckets = groupTabs(
      [a, b, c, d],
      { groupBy: "domainWindow", sortBy: "title" },
      CONTEXT,
    );
    assert.deepEqual(
      buckets.map(({ id, tabs, sections }) => ({
        id,
        tabs,
        sections: sections.map(({ label, tabs }) => [label, tabs]),
      })),
      [
        {
          id: "domainWindow:a.test",
          tabs: [b, c, a],
          sections: [
            ["Window 1", [b]],
            ["Window 2 (Current)", [c, a]],
          ],
        },
        {
          id: "domainWindow:b.test",
          tabs: [d],
          sections: [["Window 2 (Current)", [d]]],
        },
      ],
    );
  });

  await t.test("collected bucket of domainWindow has sections", () => {
    const [a, b, c] = [
      { url: "https://a.test", windowId: 2 },
      { url: "https://b.test", windowId: 1 },
      { url: "https://c.test", windowId: 2 },
    ].map(makeTab);
    const [bucket] = groupTabs(
      [a, b, c],
      { groupBy: "domainWindow", sortBy: "order" },
      CONTEXT,
    );
    assert.equal(bucket.id, "domainWindow:(other)");
    assert.deepEqual(
      bucket.sections.map(({ label, tabs }) => [label, tabs]),
      [
        ["Window 1", [b]],
        ["Window 2 (Current)", [a, c]],
      ],
    );
  });

  await t.test("keeps ranked tabs in place within their section", () => {
    const [a, b, c] = [
      { windowId: 2, title: "a" },
      { windowId: 1, title: "b" },
      { windowId: 2, title: "c" },
    ].map((tab) => makeTab({ ...tab, url: "https://a.test/" }));
    const ranks = new Map([
      [c.id, 0],
      [b.id, 1],
    ]);
    const [bucket] = groupTabs(
      [a, b, c],
      { groupBy: "domainWindow", sortBy: "title", ranks },
      CONTEXT,
    );
    assert.deepEqual(bucket.tabs, [b, c, a]);
  });

  await t.test("leaves other groupings without sections", () => {
    const [bucket] = groupTabs(
      [makeTab()],
      { groupBy: "domain", sortBy: "title" },
      CONTEXT,
    );
    assert.equal(bucket.sections, undefined);
  });

  await t.test("returns nothing for no tabs", () => {
    assert.deepEqual(
      groupTabs([], { groupBy: "window", sortBy: "recent" }, CONTEXT),
      [],
    );
  });
});

test("domainOptions ranks by tab count, then name", () => {
  const urls = [
    "https://b.test/1",
    "https://b.test/2",
    "https://c.test/1",
    "https://c.test/2",
    "https://c.test/3",
    "https://a.test/1",
    "https://www.a.test/2",
    "https://single.test",
  ];
  const tabs = urls.map((url) => makeTab({ url }));
  assert.deepEqual(domainOptions(tabs), [
    ["c.test", 3],
    ["a.test", 2],
    ["b.test", 2],
    ["single.test", 1],
  ]);
});
