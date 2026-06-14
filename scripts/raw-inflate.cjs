const fs = require("fs");
const zlib = require("zlib");

const filePath = "c:/Users/ted97/Desktop/模組開發/文靜資源包/assets/qp_item/textures/equipment/necklace/yellow.png";
const buf = fs.readFileSync(filePath);

console.log("File size:", buf.length);

// Parse PNG chunks manually
let offset = 8; // skip PNG signature
const chunks = [];
while (offset < buf.length) {
  const len = buf.readUInt32BE(offset);
  const type = buf.slice(offset + 4, offset + 8).toString("ascii");
  const data = buf.slice(offset + 8, offset + 8 + len);
  const crc = buf.readUInt32BE(offset + 8 + len);
  chunks.push({ type, data, crc, offset });
  console.log(`Chunk ${type}: len=${len}, crc=${crc.toString(16)}, offset=${offset}`);
  offset += 12 + len;
}

// Get IDAT data
const idat = chunks.find(c => c.type === "IDAT");
if (!idat) { console.log("No IDAT!"); process.exit(1); }

const idatData = idat.data;
console.log("\nIDAT data first 20 bytes:", idatData.slice(0, 20).toString("hex"));
console.log("IDAT zlib header: CMF=", idatData[0].toString(16), "FLG=", idatData[1].toString(16));

// Try multiple decompression approaches
const approaches = [
  { name: "zlib.inflateSync", fn: () => zlib.inflateSync(idatData) },
  { name: "zlib.inflateRawSync (skip 2 byte header)", fn: () => zlib.inflateRawSync(idatData.slice(2)) },
  { name: "zlib.inflateRawSync (full data)", fn: () => zlib.inflateRawSync(idatData) },
  { name: "zlib.inflateSync (no check)", fn: () => zlib.inflateSync(idatData, { finishFlush: zlib.constants.Z_SYNC_FLUSH }) },
  { name: "zlib.inflateRawSync (no check)", fn: () => zlib.inflateRawSync(idatData.slice(2), { finishFlush: zlib.constants.Z_SYNC_FLUSH }) },
];

for (const a of approaches) {
  try {
    const result = a.fn();
    console.log(`\n${a.name}: SUCCESS (${result.length} bytes)`);
    console.log("First 30 bytes:", result.slice(0, 30).toString("hex"));
    // For RGBA 16x16, expected = 16 * (1 + 16*4) = 16 * 65 = 1040
    console.log("Expected size for 16x16 RGBA:", 16 * (1 + 16 * 4));
    break;
  } catch (e) {
    console.log(`\n${a.name}: FAILED (${e.message})`);
  }
}
