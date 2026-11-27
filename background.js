const VIEW_URL = browser.runtime.getURL("view/index.html");

// Moving an open view keeps its state (search, expanded cards, undo), and
// makes the clicked window the target of "Move … into this window".
browser.action.onClicked.addListener(async ({ windowId, incognito }) => {
  const tabs = await browser.tabs.query({});
  // Tabs cannot move between private and normal windows.
  const existing = tabs.find(
    (tab) => tab.url === VIEW_URL && tab.incognito === incognito,
  );
  if (existing?.id === undefined) {
    await browser.tabs.create({ url: VIEW_URL, windowId });
    return;
  }
  if (existing.windowId !== windowId) {
    await browser.tabs.move(existing.id, { windowId, index: -1 });
  }
  await browser.tabs.update(existing.id, { active: true });
});

// The tabs API has no creation timestamp, so record one as a session value
// (survives restarts and session restore).
browser.tabs.onCreated.addListener(async ({ id }) => {
  if (id === undefined) {
    return;
  }
  try {
    const createdAt = await browser.sessions.getTabValue(id, "createdAt");
    if (createdAt === undefined) {
      await browser.sessions.setTabValue(id, "createdAt", Date.now());
    }
  } catch {
    // The tab closed right away (e.g. a popup or redirect).
  }
});
