const FOCUSABLE = "[data-focus-key]";

/** @param {Element} container */
function focusables(container) {
  return /** @type {HTMLElement[]} */ ([
    ...container.querySelectorAll(FOCUSABLE),
  ]);
}

/**
 * Runs an update that replaces the container's content, then moves focus to
 * the element with the same `data-focus-key`, or else to the one now at the
 * same position (e.g. the next row after closing a tab).
 *
 * @param {Element} container
 * @param {() => void} update
 */
export function preserveFocus(container, update) {
  const active = document.activeElement;
  const index = focusables(container).findIndex((node) => node === active);
  update();
  if (!(active instanceof HTMLElement) || index === -1) {
    return;
  }
  const candidates = focusables(container);
  const target =
    candidates.find(
      (node) => node.dataset.focusKey === active.dataset.focusKey,
    ) ?? candidates[Math.min(index, candidates.length - 1)];
  target?.focus({ preventScroll: true });
}
