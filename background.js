const VIEW_URL = browser.runtime.getURL("view/index.html");

browser.action.onClicked.addListener(async () => {
  const tabs = await browser.tabs.query({});
  const existing = tabs.find((tab) => tab.url === VIEW_URL);
  if (existing?.id === undefined || existing.windowId === undefined) {
    await browser.tabs.create({ url: VIEW_URL });
    return;
  }
  await browser.tabs.update(existing.id, { active: true });
  await browser.windows.update(existing.windowId, { focused: true });
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
