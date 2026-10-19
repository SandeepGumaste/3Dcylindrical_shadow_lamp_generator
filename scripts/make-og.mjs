// Renders site/assets/og.png (1200x630) with no dependencies: shapes are drawn
// pixel by pixel and encoded with node:zlib. Run: node scripts/make-og.mjs
// The picture matches the landing page hero: a glowing lamp shade and the
// moon-and-stars shadow it casts on the wall.
import {deflateSync} from 'node:zlib';
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const W = 1200, H = 630;
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../site/assets/og.png');

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const cover = (d) => clamp(0.5 - d); // anti-aliased coverage from a signed distance in pixels

const WALL_TOP = [27, 24, 44], WALL_BOT = [14, 13, 26], AMBER = [255, 196, 99], SHADE = [58, 48, 72];

// Signed distances (negative inside).
const circle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
const star = (x, y, cx, cy, r) => {
  // four-point star as a union-free approximation: scaled diamond with concave edges
  const dx = Math.abs(x - cx) / r, dy = Math.abs(y - cy) / r;
  return (Math.sqrt(dx) + Math.sqrt(dy) - 1) * r * 0.55;
};
const roundRect = (x, y, cx, cy, hw, hh, r) => {
  const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

const buf = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  buf[y * (W * 3 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    let c = mix(WALL_TOP, WALL_BOT, y / H);
    // light cone spilling onto the wall (right side)
    const glow = Math.exp(-1.6 * Math.hypot((x - 400) / 520, (y - 330) / 330) ** 2);
    c = mix(c, [120, 84, 52], glow * 0.55);
    // the shadow picture: a lit disc with a moon bite and stars cut out
    const discD = circle(x, y, 840, 315, 210);
    const lit = cover(discD);
    const pic = lit * (1 - cover(circle(x, y, 905, 285, 150)));
    const stars = Math.max(
      cover(star(x, y, 745, 405, 38)),
      cover(star(x, y, 800, 215, 22)),
      cover(star(x, y, 960, 440, 28)),
    );
    c = mix(c, AMBER, pic * 0.95);
    c = mix(c, AMBER, clamp(stars) * 0.95);
    // the shade: a cylinder on the left, dark with pinhole glow
    const sh = cover(roundRect(x, y, 330, 330, 150, 200, 26));
    if (sh > 0) {
      const edge = clamp(Math.abs(x - 330) / 150);
      let s = mix(SHADE, [30, 24, 40], edge * edge);
      const gx = ((x - 150) % 36) - 18, gy = ((y - 150) % 36) - 18;
      const hole = cover(circle(gx, gy, 0, 0, 5.5));
      // the inner lamp shows through holes
      s = mix(s, AMBER, hole * (1 - edge * 0.5));
      c = mix(c, s, sh);
    }
    // table line
    c = mix(c, [10, 9, 18], cover(-(y - 560)) );
    const i = y * (W * 3 + 1) + 1 + x * 3;
    buf[i] = Math.round(c[0]); buf[i + 1] = Math.round(c[1]); buf[i + 2] = Math.round(c[2]);
  }
}

const crcTable = Array.from({length: 256}, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b) => {
  let c = 0xffffffff;
  for (const v of b) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const t = Buffer.from(type), len = Buffer.alloc(4), sum = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  sum.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, sum]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
mkdirSync(path.dirname(out), {recursive: true});
writeFileSync(out, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(buf, {level: 9})), chunk('IEND', Buffer.alloc(0)),
]));
console.log('wrote', out);
