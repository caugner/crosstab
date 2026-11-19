import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countDuplicates,
  domainFilter,
  FILTER_DUPLICATES,
  filterTabs,
} from "../view/lib/filter.js";
import { countUrls } from "../view/lib/grouping.js";
import { makeTab } from "./helpers.js";

test("filterTabs", async (t) => {
  const mdn = makeTab({
    title: "MDN Web Docs",
    url: "https://developer.mozilla.org/",
  });
  const blog = makeTab({ title: "Blog", url: "https://example.com/MDN" });
  const other = makeTab({ title: "Other", url: "https://example.com/other" });
  const copy = makeTab({ title: "Copy", url: "https://example.com/other#top" });
  const tabs = [mdn, blog, other, copy];
  const urlCounts = countUrls(tabs);
  const cases = [
    { name: "no criteria", criteria: {}, expected: tabs },
    {
      name: "query matches title or URL, ignoring case",
      criteria: { query: "mdn" },
      expected: [mdn, blog],
    },
    {
      name: "domain",
      criteria: { filter: domainFilter("example.com") },
      expected: [blog, other, copy],
    },
    {
      name: "duplicates",
      criteria: { filter: FILTER_DUPLICATES },
      expected: [other, copy],
    },
    {
      name: "query and domain",
      criteria: { query: "MDN", filter: domainFilter("example.com") },
      expected: [blog],
    },
    {
      name: "query and duplicates",
      criteria: { query: "copy", filter: FILTER_DUPLICATES },
      expected: [copy],
    },
    {
      // A domain cannot collide with the built-in filter values.
      name: "domain named like the duplicates filter",
      criteria: { filter: domainFilter(FILTER_DUPLICATES) },
      expected: [],
    },
    { name: "no match", criteria: { query: "nope" }, expected: [] },
  ];
  for (const { name, criteria, expected } of cases) {
    await t.test(name, () => {
      assert.deepEqual(filterTabs(tabs, criteria, urlCounts), expected);
    });
  }
});

test("countDuplicates counts tabs sharing a URL up to the fragment", () => {
  const tabs = [
    makeTab({ url: "https://a.test/#x" }),
    makeTab({ url: "https://a.test/#y" }),
    makeTab({ url: "https://a.test/?q" }),
    makeTab({ url: "https://b.test/" }),
  ];
  const urlCounts = countUrls(tabs);
  assert.equal(urlCounts.get("https://a.test/"), 2);
  assert.equal(countDuplicates(tabs, urlCounts), 2);
  // Counts come from all tabs, so a filtered subset still reports duplicates.
  assert.equal(countDuplicates(tabs.slice(0, 1), urlCounts), 1);
});

test("countUrls ignores internal about: pages", () => {
  const tabs = [
    makeTab({ url: "about:newtab" }),
    makeTab({ url: "about:newtab" }),
  ];
  const urlCounts = countUrls(tabs);
  assert.equal(urlCounts.size, 0);
  assert.equal(countDuplicates(tabs, urlCounts), 0);
});
