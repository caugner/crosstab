import assert from "node:assert/strict";
import { test } from "node:test";

import {
  displayPath,
  displayUrl,
  domainOf,
  duplicateKey,
} from "../view/lib/url.js";

function table(fn, cases) {
  return async (t) => {
    for (const { input, expected } of cases) {
      await t.test(input || "(empty)", () => {
        assert.equal(fn(input), expected);
      });
    }
  };
}

test(
  "domainOf",
  table(domainOf, [
    { input: "https://example.com/path", expected: "example.com" },
    { input: "http://www.example.com", expected: "example.com" },
    { input: "https://www.docs.example.com", expected: "docs.example.com" },
    { input: "https://wwwexample.com", expected: "wwwexample.com" },
    { input: "http://localhost:8080/", expected: "localhost" },
    { input: "about:debugging", expected: "about:" },
    {
      input: "moz-extension://abc/view/index.html",
      expected: "moz-extension:",
    },
    { input: "file:///tmp/a.html", expected: "file:" },
    { input: "not a url", expected: "(unknown)" },
    { input: "", expected: "(unknown)" },
  ]),
);

test(
  "duplicateKey",
  table(duplicateKey, [
    { input: "https://example.com/a", expected: "https://example.com/a" },
    { input: "https://example.com/a#b", expected: "https://example.com/a" },
    {
      input: "https://example.com/a?q=1#b#c",
      expected: "https://example.com/a?q=1",
    },
    { input: "", expected: "" },
  ]),
);

test(
  "displayUrl",
  table(displayUrl, [
    { input: "https://example.com/a", expected: "example.com/a" },
    { input: "http://example.com/a", expected: "example.com/a" },
    { input: "about:blank", expected: "about:blank" },
    { input: "file:///https://x", expected: "file:///https://x" },
  ]),
);

test(
  "displayPath",
  table(displayPath, [
    { input: "https://example.com/", expected: "/" },
    { input: "https://example.com", expected: "/" },
    { input: "https://example.com/a/b", expected: "/a/b" },
    { input: "http://example.com/a?q=1#h", expected: "/a?q=1#h" },
    { input: "https://example.com/?q=1", expected: "/?q=1" },
    { input: "about:debugging", expected: "about:debugging" },
    { input: "file:///tmp/a.html", expected: "file:///tmp/a.html" },
    { input: "not a url", expected: "not a url" },
    { input: "", expected: "" },
  ]),
);
