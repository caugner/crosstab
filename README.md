# Crosstab

A Firefox extension that shows all open tabs across windows on one page, so you can find, group, deduplicate, and close them.

## Features

- **Group by** window, domain, domain + window, tab group, last accessed, or created (Today, Yesterday, Last 7 days, Last 30 days, Older).
- **Sort by** recent activity, tab order, title, or URL, and **display** the title, URL, or both.
- **Search** by title or URL, with open domains suggested as you type. `is:duplicate` shows only duplicates.
- **Duplicates** (same URL, ignoring the `#fragment`) get a `×N` badge. `about:` pages are not counted.
- **Click** a tab to switch to it, or close a single tab or a whole group (with confirmation).
- **Merge windows** moves all tabs into the Crosstab window, with the Crosstab tab first. **Merge as groups** also puts each window's ungrouped tabs into a `Window N` tab group. Existing tab groups move as they are, and private windows are merged only with each other. **Undo merge** restores the previous windows and groups while the Crosstab tab stays open.
- **Mirror grouping as tab groups** (in any grouping other than window) turns the shown cards into tab groups in the Crosstab window, in card order, keeping the titles and colors of existing tab groups. Only tabs matching the search move, and pinned tabs stay. It can be undone the same way.
- Updates live as tabs change, and keeps items in place while the pointer is over them.

Clicking the toolbar button opens Crosstab, or moves it into the current window if it is already open.

## Notes

- Firefox has no tab creation timestamp, so Crosstab records one when a tab opens. Tabs opened before installing it show as "Unknown" under "Created".
- Tabs in private windows are listed (if the extension is allowed there) and their window is marked "(Private)".
- Group by, Sort by, and Display are remembered. Search resets when the page reloads.
- Crosstab collects no data. It needs the `tabs`, `tabGroups`, and `sessions` permissions.

## Development

Requires Node.js and Firefox 142 or later.

```sh
npm install
npm start      # run in a temporary Firefox profile
npm run check  # format, lint, type check, web-ext lint, tests
npm run build  # package into web-ext-artifacts/
```

## AMO listing

The listing description and links live in `amo-metadata.json` and are applied on every release. The icon and screenshots live in `listing/`. The `Listing` workflow uploads them whenever `listing/` or `amo-metadata.json` changes on `main`, or when run manually.

```sh
npm run screenshots  # recapture listing/screenshots/ in headless Firefox (needs network)
AMO_JWT_ISSUER=... AMO_JWT_SECRET=... npm run listing  # upload by hand, as the workflow does
```

## Releasing

[release-please](https://github.com/googleapis/release-please) keeps a release PR open based on [conventional commits](https://www.conventionalcommits.org/). Merging it bumps the version, tags a GitHub release, and submits the extension to [AMO](https://addons.mozilla.org/) as a listed version, which is published once it passes review.

Signing needs the `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` repository secrets ([AMO API credentials](https://addons.mozilla.org/developers/addon/api/key/)).
