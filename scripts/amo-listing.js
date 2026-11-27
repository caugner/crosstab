// Updates the AMO listing to match the metadata from `amo-metadata.json`, the
// icon, and the screenshots, skipping what is already up to date. Pass
// `--dry-run` to only print the changes. Needs `AMO_JWT_ISSUER` and
// `AMO_JWT_SECRET`, the same API credentials as `npm run sign`.
import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { ICON, SCREENSHOTS } from "../listing/listing.js";
import { pixelDigest } from "./png.js";

const API = "https://addons.mozilla.org/api/v5/addons/addon";
const { AMO_JWT_ISSUER: issuer, AMO_JWT_SECRET: secret } = process.env;
if (!issuer || !secret) {
  throw new Error("Set AMO_JWT_ISSUER and AMO_JWT_SECRET");
}

/** Longest `Retry-After` to wait out; AMO has asked for up to a day. */
const MAX_WAIT = 60 * 60;

/**
 * Spacing between writes. Every `POST`, `PATCH` and `DELETE` on an add-on,
 * including throttled ones, counts against limits of 3/minute, 10/hour and
 * 24/day per user, shared with `npm run sign`.
 */
const WRITE_INTERVAL = 21 * 1000;

const dryRun = process.argv.includes("--dry-run");

/** Identifies this client to AMO, instead of the default `node`. */
const USER_AGENT = "crosstab-listing (+https://github.com/caugner/crosstab)";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const addonUrl = `${API}/${manifest.browser_specific_settings.gecko.id}`;

/** @param {object} value */
function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** A short-lived token per request, as AMO rejects reused `jti` values. */
function authorization() {
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url({
    iss: issuer,
    jti: randomUUID(),
    iat,
    exp: iat + 60,
  })}`;
  const signature = createHmac("sha256", /** @type {string} */ (secret))
    .update(unsigned)
    .digest("base64url");
  return `JWT ${unsigned}.${signature}`;
}

let nextWrite = 0;

/**
 * @param {string} url
 * @param {string} method
 * @param {FormData | object} [body]
 */
async function request(url, method, body) {
  if (method !== "GET") {
    await sleep(nextWrite - Date.now());
    nextWrite = Date.now() + WRITE_INTERVAL;
  }
  const json = body !== undefined && !(body instanceof FormData);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authorization(),
      "User-Agent": USER_AGENT,
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body: json ? JSON.stringify(body) : body,
  });
  const text = await response.text();
  if (response.status === 429) {
    const seconds = Number(response.headers.get("Retry-After")) || 60;
    if (seconds > MAX_WAIT) {
      throw new Error(
        `Throttled for ${seconds}s, rerun later: ${method} ${url}`,
      );
    }
    console.log(`Throttled, retrying in ${seconds}s`);
    await sleep(seconds * 1000);
    return request(url, method, body);
  }
  if (!response.ok) {
    throw new Error(`${method} ${url}: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : undefined;
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(ms, 0)));
}

/**
 * @param {string} field
 * @param {string} path
 */
async function fileForm(field, path) {
  const form = new FormData();
  const blob = new Blob([await readFile(path)], { type: "image/png" });
  form.set(field, blob, basename(path));
  return form;
}

/**
 * The pixel digest of an image on AMO, or `undefined` if it can't be compared.
 *
 * @param {string | undefined} url
 */
async function remoteDigest(url) {
  if (!url) return undefined;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!response.ok) return undefined;
    return pixelDigest(Buffer.from(await response.arrayBuffer()));
  } catch {
    return undefined;
  }
}

/** @param {string} path */
async function localDigest(path) {
  return pixelDigest(await readFile(path));
}

/**
 * Whether AMO already has `value`. Translated fields only need the given
 * locales to match, as AMO keeps the others.
 *
 * @param {unknown} value
 * @param {any} current
 */
function isUpToDate(value, current) {
  // `homepage` and `support_url` also return `outgoing` redirect URLs.
  const actual = current?.url ?? current;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).every(([locale, text]) =>
      isDeepStrictEqual(actual?.[locale], text),
    );
  }
  return isDeepStrictEqual(actual, value);
}

/** @type {{ description: string, writes: number, run: () => Promise<void> }[]} */
const changes = [];

const addon = await request(`${addonUrl}/`, "GET");

// Version fields only apply to new versions, see `npm run sign`.
const metadata = JSON.parse(await readFile("amo-metadata.json", "utf8"));
delete metadata.version;
const outdated = Object.fromEntries(
  Object.entries(metadata).filter(
    ([key, value]) => !isUpToDate(value, addon[key]),
  ),
);
if (Object.keys(outdated).length) {
  changes.push({
    description: `Update ${Object.keys(outdated).join(", ")}`,
    writes: 1,
    run: () => request(`${addonUrl}/`, "PATCH", outdated),
  });
}

if ((await remoteDigest(addon.icons?.["128"])) !== (await localDigest(ICON))) {
  changes.push({
    description: `Upload icon ${ICON}`,
    writes: 1,
    run: async () => {
      await request(`${addonUrl}/`, "PATCH", await fileForm("icon", ICON));
    },
  });
}

/** @type {{ id: number, caption: Record<string, string> | null, position: number, image_url: string }[]} */
const previews = addon.previews;
const unmatched = new Map(
  await Promise.all(
    previews.map(
      async (preview) =>
        /** @type {const} */ ([preview, await remoteDigest(preview.image_url)]),
    ),
  ),
);

for (const [position, { file, caption }] of SCREENSHOTS.entries()) {
  const captions = { "en-US": caption };
  const digest = await localDigest(file);
  const match = [...unmatched].find(([, remote]) => remote === digest)?.[0];
  if (match) {
    unmatched.delete(match);
    const update = {
      ...(isUpToDate(captions, match.caption) ? {} : { caption: captions }),
      ...(match.position === position ? {} : { position }),
    };
    if (Object.keys(update).length) {
      changes.push({
        description: `Update ${Object.keys(update).join(", ")} of ${file}`,
        writes: 1,
        run: () =>
          request(`${addonUrl}/previews/${match.id}/`, "PATCH", update),
      });
    }
    continue;
  }
  changes.push({
    description: `Upload screenshot ${file}`,
    writes: 2,
    run: async () => {
      const form = await fileForm("image", file);
      form.set("position", String(position));
      const { id } = await request(`${addonUrl}/previews/`, "POST", form);
      // AMO rejects a caption in the same request as the image.
      await request(`${addonUrl}/previews/${id}/`, "PATCH", {
        caption: captions,
      });
    },
  });
}

// Deleted after the uploads, so a throttled or failed run never leaves the
// listing without screenshots. Rerunning removes any leftovers.
for (const [{ id, image_url }] of unmatched) {
  changes.push({
    description: `Delete screenshot ${image_url}`,
    writes: 1,
    run: () => request(`${addonUrl}/previews/${id}/`, "DELETE"),
  });
}

const writes = changes.reduce((sum, change) => sum + change.writes, 0);
if (!changes.length) {
  console.log("Listing is up to date");
} else {
  console.log(`${writes} write requests needed (AMO allows 10/hour):`);
}
for (const change of changes) {
  if (dryRun) {
    console.log(`- ${change.description}`);
  } else {
    await change.run();
    console.log(`${change.description}: done`);
  }
}
