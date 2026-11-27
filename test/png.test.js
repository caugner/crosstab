import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { describe, it } from "node:test";
import { deflateSync } from "node:zlib";

import { pixelDigest } from "../scripts/png.js";

/** 2x2 RGBA pixels. */
const PIXELS = [
  [255, 0, 0, 255],
  [0, 255, 0, 255],
  [0, 0, 255, 255],
  [10, 20, 30, 255],
];

/**
 * @param {Buffer} data
 * @param {string} type
 */
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  // The decoder ignores the CRC.
  return Buffer.concat([
    length,
    Buffer.from(type, "ascii"),
    data,
    Buffer.alloc(4),
  ]);
}

/**
 * Encodes a 2x2 PNG with the given color type, applying `filter` to every row.
 *
 * @param {{ color: 2 | 6, filter: number, pixels?: number[][] }} options
 */
function encode({ color, filter, pixels = PIXELS }) {
  const channels = color === 6 ? 4 : 3;
  const rows = [pixels.slice(0, 2), pixels.slice(2)].map((row) =>
    Buffer.from(row.flatMap((pixel) => pixel.slice(0, channels))),
  );
  const filtered = rows.map((line, y) => {
    const previous = y > 0 ? rows[y - 1] : Buffer.alloc(line.length);
    const out = Buffer.alloc(line.length + 1);
    out[0] = filter;
    for (let x = 0; x < line.length; x++) {
      const left = x >= channels ? line[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      const p = left + up - upLeft;
      const [a, b, c] = [left, up, upLeft].map((v) => Math.abs(p - v));
      const paeth = a <= b && a <= c ? left : b <= c ? up : upLeft;
      const predictor = [0, left, up, (left + up) >> 1, paeth][filter];
      out[x + 1] = (line[x] - predictor) & 255;
    }
    return out;
  });
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header[8] = 8;
  header[9] = color;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(filtered))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("pixelDigest", () => {
  const expected = pixelDigest(encode({ color: 6, filter: 0 }));

  for (const { name, png } of [
    { name: "RGB", png: encode({ color: 2, filter: 0 }) },
    { name: "sub filter", png: encode({ color: 6, filter: 1 }) },
    { name: "up filter", png: encode({ color: 6, filter: 2 }) },
    { name: "average filter", png: encode({ color: 6, filter: 3 }) },
    { name: "Paeth filter", png: encode({ color: 2, filter: 4 }) },
  ]) {
    it(`matches the same pixels encoded with ${name}`, () => {
      assert.equal(pixelDigest(png), expected);
    });
  }

  it("differs for different pixels", () => {
    const pixels = PIXELS.with(3, [10, 20, 31, 255]);
    assert.notEqual(
      pixelDigest(encode({ color: 6, filter: 0, pixels })),
      expected,
    );
  });
});
