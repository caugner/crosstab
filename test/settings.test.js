import assert from "node:assert/strict";
import { test } from "node:test";

import { readChoice } from "../view/lib/settings.js";

test("readChoice", async (t) => {
  const choices = ["window", "domain"];
  const cases = [
    { name: "stored choice", stored: "domain", expected: "domain" },
    { name: "nothing stored", stored: null, expected: "window" },
    { name: "choice no longer offered", stored: "color", expected: "window" },
    { name: "inherited property name", stored: "toString", expected: "window" },
  ];
  for (const { name, stored, expected } of cases) {
    await t.test(name, () => {
      const storage = { getItem: () => stored };
      assert.equal(readChoice(storage, "groupBy", choices), expected);
    });
  }
});
