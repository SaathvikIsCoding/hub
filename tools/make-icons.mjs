// Draws the pixel-ship app icons as PNGs (no dependencies): node tools/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// Same ship as the portfolio favicon, on an 11x11 grid. c = cyan, p = pink, g = gold.
const SHIP = [
  '...........',
  '.....c.....',
  '....ccc....',
  '....cpc....',
  '...ccpcc...',
  '...ccccc...',
  '..ccgcgcc..',
  '.cc.ccc.cc.',
  '.c..c.c..c.',
  '...........',
  '...........'
];
const COLORS = { c: [0x22, 0xd3, 0xee], p: [0xf4, 0x72, 0xb6], g: [0xfa, 0xcc, 0x15] };

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size, shipShare) {
  const cell = Math.floor((size * shipShare) / 9); // the ship spans 9 cells across
  const offX = Math.round((size - cell * 11) / 2);
  const offY = Math.round((size - cell * 11) / 2) + Math.round(cell / 2);
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3); // filter byte 0, RGB on black
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - offX) / cell), gy = Math.floor((y - offY) / cell);
      const ch = SHIP[gy]?.[gx];
      const rgb = COLORS[ch];
      if (rgb && x >= offX && y >= offY) row.set(rgb, 1 + x * 3);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const out = new URL('../icons/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), png(192, 0.62));
writeFileSync(new URL('icon-512.png', out), png(512, 0.62));
writeFileSync(new URL('maskable-512.png', out), png(512, 0.48)); // stays inside the maskable safe zone
writeFileSync(new URL('apple-touch-icon.png', out), png(180, 0.62));
console.log('Icons written to icons/');
