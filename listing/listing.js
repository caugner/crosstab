/** AMO listing assets, shared by `scripts/screenshots.js` and `scripts/amo-listing.js`. */

export const ICON = "listing/icon-128.png";

/** View settings per screenshot, in listing order. */
export const SCREENSHOTS = [
  {
    file: "listing/screenshots/1-window.png",
    caption: "All open tabs, grouped by window.",
    settings: { groupBy: "window", sortBy: "order", label: "title" },
  },
  {
    file: "listing/screenshots/2-domain.png",
    caption: "Grouped by domain, with duplicate tabs marked.",
    settings: { groupBy: "domain", sortBy: "title", label: "both" },
  },
  {
    file: "listing/screenshots/3-tab-group.png",
    caption: "Grouped by tab group.",
    settings: { groupBy: "tabGroup", sortBy: "order", label: "title" },
  },
  {
    file: "listing/screenshots/4-created.png",
    caption: "Grouped by when tabs were opened.",
    settings: { groupBy: "created", sortBy: "recent", label: "both" },
  },
];

export const DAY = 24 * 60 * 60 * 1000;

/**
 * Demo windows. The first is the one showing Crosstab. `age` (days) sets the
 * recorded creation time.
 *
 * @type {{tabs: {url: string, age: number}[], groups?: {title: string, color: string, tabs: number[]}[]}[]}
 */
export const DEMO_WINDOWS = [
  {
    tabs: [
      { url: "https://developer.mozilla.org/en-US/docs/Web/CSS", age: 0 },
      {
        url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
        age: 0,
      },
      {
        url: "https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs",
        age: 1,
      },
      {
        url: "https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions",
        age: 1,
      },
      { url: "https://github.com/caugner/crosstab", age: 0 },
    ],
    groups: [{ title: "MDN", color: "blue", tabs: [0, 1, 2, 3] }],
  },
  {
    tabs: [
      { url: "https://en.wikipedia.org/wiki/Firefox", age: 3 },
      { url: "https://en.wikipedia.org/wiki/Tab_(interface)", age: 3 },
      { url: "https://en.wikipedia.org/wiki/Web_browser", age: 12 },
      { url: "https://en.wikipedia.org/wiki/Firefox", age: 0 },
      { url: "https://www.mozilla.org/en-US/firefox/", age: 40 },
      { url: "https://blog.mozilla.org/", age: 5 },
    ],
    groups: [{ title: "Reading", color: "yellow", tabs: [0, 1, 2] }],
  },
  {
    tabs: [
      { url: "https://caniuse.com/", age: 2 },
      { url: "https://web.dev/", age: 8 },
      { url: "https://developer.mozilla.org/en-US/docs/Web/CSS", age: 9 },
      { url: "https://addons.mozilla.org/en-US/firefox/", age: 0 },
      { url: "https://www.w3.org/", age: 25 },
    ],
    groups: [{ title: "Compat", color: "green", tabs: [0, 1] }],
  },
  {
    tabs: [
      { url: "https://www.typescriptlang.org/", age: 6 },
      { url: "https://eslint.org/", age: 6 },
      { url: "https://prettier.io/", age: 6 },
      { url: "https://nodejs.org/en", age: 15 },
      { url: "https://www.rust-lang.org/", age: 60 },
      { url: "https://github.com/caugner/crosstab", age: 1 },
    ],
    groups: [{ title: "Tooling", color: "purple", tabs: [0, 1, 2] }],
  },
];
