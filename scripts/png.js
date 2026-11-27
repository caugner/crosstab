import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

/** Channels per pixel, by PNG color type. */
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Hashes the RGBA pixels of a PNG, so images re-encoded by AMO still match
 * the uploaded files. Only supports 8-bit, non-interlaced images, and ignores
 * palette transparency, as a false mismatch only causes a redundant upload.
 *
 * @param {Buffer} png
 */
export function pixelDigest(png) {
  /** @type {{ width: number, height: number, color: number } | undefined} */
  let header;
  /** @type {Buffer | undefined} */
  let palette;
  const data = [];
  for (let pos = 8; pos < png.length;) {
    const length = png.readUInt32BE(pos);
    const type = png.toString("ascii", pos + 4, pos + 8);
    const chunk = png.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") {
      if (chunk[8] !== 8 || chunk[12] !== 0) {
        throw new Error("Unsupported PNG bit depth or interlacing");
      }
      header = {
        width: chunk.readUInt32BE(0),
        height: chunk.readUInt32BE(4),
        color: chunk[9],
      };
    } else if (type === "PLTE") {
      palette = chunk;
    } else if (type === "IDAT") {
      data.push(chunk);
    }
    pos += 12 + length;
  }
  if (!header) {
    throw new Error("Not a PNG");
  }
  const { width, height, color } = header;
  const channels = CHANNELS[/** @type {keyof typeof CHANNELS} */ (color)];
  if (!channels || (color === 3 && !palette)) {
    throw new Error(`Unsupported PNG color type ${color}`);
  }

  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const rgba = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start];
    const line = Buffer.from(raw.subarray(start + 1, start + 1 + stride));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? line[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      line[x] += [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][
        filter
      ];
    }
    for (let x = 0; x < width; x++) {
      const [a = 0, b = 0, c = 0, d = 0] = line.subarray(
        x * channels,
        (x + 1) * channels,
      );
      const index = /** @type {Buffer} */ (palette)?.subarray(a * 3, a * 3 + 3);
      const pixel = {
        0: [a, a, a, 255],
        2: [a, b, c, 255],
        3: [...(index ?? []), 255],
        4: [a, a, a, b],
        6: [a, b, c, d],
      }[/** @type {keyof typeof CHANNELS} */ (color)];
      rgba.set(pixel, (y * width + x) * 4);
    }
    previous = line;
  }
  return createHash("sha256")
    .update(`${width}x${height}`)
    .update(rgba)
    .digest("hex");
}

/**
 * @param {number} left
 * @param {number} up
 * @param {number} upLeft
 */
function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const toLeft = Math.abs(p - left);
  const toUp = Math.abs(p - up);
  const toUpLeft = Math.abs(p - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}
