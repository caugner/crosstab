/** @param {string} url */
export function domainOf(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol === "http:" || protocol === "https:") {
      return hostname.replace(/^www\./, "");
    }
    return protocol;
  } catch {
    return "(unknown)";
  }
}

/**
 * Tabs count as duplicates if their URLs match ignoring the fragment.
 *
 * @param {string} url
 */
export function duplicateKey(url) {
  return url.split("#", 1)[0];
}

/**
 * The URL without the host for web pages, for use under a heading naming it.
 *
 * @param {string} url
 */
export function displayPath(url) {
  try {
    const { protocol, pathname, search, hash } = new URL(url);
    if (protocol === "http:" || protocol === "https:") {
      return pathname + search + hash;
    }
  } catch {
    // Fall through to the full URL.
  }
  return displayUrl(url);
}

/** @param {string} url */
export function displayUrl(url) {
  return url.replace(/^https?:\/\//, "");
}
