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

/** @param {string} url */
export function displayUrl(url) {
  return url.replace(/^https?:\/\//, "");
}
