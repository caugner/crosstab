import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countDuplicates,
  filterTabs,
  otherCopies,
  toggleDuplicateKeyword,
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
    { name: "empty query", query: "", expected: tabs },
    {
      name: "query matches title or URL, ignoring case",
      query: "mdn",
      expected: [mdn, blog],
    },
    {
      name: "duplicates keyword, ignoring case",
      query: "IS:Duplicate",
      expected: [other, copy],
    },
    {
      name: "query matches a domain",
      query: "example.com",
      expected: [blog, other, copy],
    },
    {
      name: "query and duplicates",
      query: "copy is:duplicate",
      expected: [copy],
    },
    { name: "no match", query: "nope", expected: [] },
  ];
  for (const { name, query, expected } of cases) {
    await t.test(name, () => {
      assert.deepEqual(filterTabs(tabs, query, urlCounts), expected);
    });
  }
});

test("toggleDuplicateKeyword", async (t) => {
  const cases = [
    { name: "empty", query: "", expected: "is:duplicate" },
    { name: "adds before text", query: "mdn", expected: "is:duplicate mdn" },
    { name: "removes", query: "is:duplicate", expected: "" },
    {
      name: "removes, keeping text",
      query: "mdn IS:duplicate",
      expected: "mdn",
    },
  ];
  for (const { name, query, expected } of cases) {
    await t.test(name, () => {
      assert.equal(toggleDuplicateKeyword(query), expected);
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

test("otherCopies", async (t) => {
  const a = makeTab({ url: "https://a.test/#x" });
  const b = makeTab({ url: "https://a.test/#y" });
  const c = makeTab({ url: "https://a.test/" });
  const query = makeTab({ url: "https://a.test/?q" });
  const lone = makeTab({ url: "https://b.test/" });
  const tabs = [a, b, c, query, lone];
  const cases = [
    { name: "ignores fragments", tab: a, expected: [b, c] },
    { name: "excludes the tab itself", tab: c, expected: [a, b] },
    { name: "query makes a different URL", tab: query, expected: [] },
    { name: "unique URL", tab: lone, expected: [] },
  ];
  for (const { name, tab, expected } of cases) {
    await t.test(name, () => {
      assert.deepEqual(otherCopies(tabs, tab), expected);
    });
  }
});
