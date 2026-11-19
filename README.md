# Crosstab

A Firefox extension that shows all open tabs across windows on one page, so you can find, group, deduplicate, and close them.

## Features

- **Group by** window, domain, domain + window, tab group, last accessed, or created (Today, Yesterday, Last 7 days, Last 30 days, Older).
- **Sort by** recent activity, tab order, title, or URL, and **display** the title, URL, or both.
- **Search** by title or URL, and **filter** to duplicates or a single domain.
- **Duplicates** (same URL, ignoring the `#fragment`) get a `×N` badge. `about:` pages are not counted.
- **Click** a tab to switch to it, or close a single tab or a whole group (with confirmation).
- Updates live as tabs change, and keeps items in place while the pointer is over them.

Clicking the toolbar button opens Crosstab, or switches to it if it is already open.

## Notes

- Firefox has no tab creation timestamp, so Crosstab records one when a tab opens. Tabs opened before installing it show as "Unknown" under "Created".
- Tabs in private windows are listed (if the extension is allowed there) and their window is marked "(Private)".
- Group by, Sort by, and Display are remembered. Search and Filter reset when the page reloads.
- Crosstab collects no data. It needs the `tabs`, `tabGroups`, and `sessions` permissions.

## Development

Requires Node.js and Firefox 142 or later.

```sh
npm install
npm start      # run in a temporary Firefox profile
npm run check  # format, lint, type check, web-ext lint, tests
npm run build  # package into web-ext-artifacts/
```
