// Updates the AMO listing: metadata from `amo-metadata.json`, icon, and
// screenshots (replacing existing ones). Needs `AMO_JWT_ISSUER` and
// `AMO_JWT_SECRET`, the same API credentials as `npm run sign`.
import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { ICON, SCREENSHOTS } from "../listing/listing.js";

const API = "https://addons.mozilla.org/api/v5/addons/addon";
const { AMO_JWT_ISSUER: issuer, AMO_JWT_SECRET: secret } = process.env;
if (!issuer || !secret) {
  throw new Error("Set AMO_JWT_ISSUER and AMO_JWT_SECRET");
}

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

/**
 * @param {string} url
 * @param {string} method
 * @param {FormData | object} [body]
 */
async function request(url, method, body) {
  const json = body !== undefined && !(body instanceof FormData);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authorization(),
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body: json ? JSON.stringify(body) : body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${url}: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : undefined;
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

// Version fields only apply to new versions, see `npm run sign`.
const metadata = JSON.parse(await readFile("amo-metadata.json", "utf8"));
delete metadata.version;
await request(`${addonUrl}/`, "PATCH", metadata);
console.log(`Updated ${Object.keys(metadata).join(", ")}`);

await request(`${addonUrl}/`, "PATCH", await fileForm("icon", ICON));
console.log(`Uploaded icon ${ICON}`);

const { previews } = await request(`${addonUrl}/`, "GET");
for (const { id } of previews) {
  await request(`${addonUrl}/previews/${id}/`, "DELETE");
}
console.log(`Deleted ${previews.length} screenshots`);

for (const [position, { file, caption }] of SCREENSHOTS.entries()) {
  const form = await fileForm("image", file);
  form.set("position", String(position));
  const { id } = await request(`${addonUrl}/previews/`, "POST", form);
  // AMO rejects a caption in the same request as the image.
  await request(`${addonUrl}/previews/${id}/`, "PATCH", {
    caption: { "en-US": caption },
  });
  console.log(`Uploaded screenshot ${file}`);
}
