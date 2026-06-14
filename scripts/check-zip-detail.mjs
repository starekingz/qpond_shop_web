import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PACKS_DIR = join(homedir(), "AppData", "Roaming", ".minecraft", "server-resource-packs");

const file = "c9a4f033cbe109b75cef563335e05f613ecf236b";
const buf = readFileSync(join(PACKS_DIR, file));

// Find ALL PK\x03\x04 positions (local file headers)
const positions = [];
for (let i = 0; i < buf.length - 4; i++) {
  if (buf[i] === 0x50 && buf[i+1] === 0x4B && buf[i+2] === 0x03 && buf[i+3] === 0x04) {
    positions.push(i);
  }
}
console.log(`Total PK\\x03\\x04 positions: ${positions.length}`);

// Parse each one
let found = 0;
for (const pos of positions) {
  const compressionMethod = buf.readUInt16LE(pos + 8);
  const compressedSize = buf.readUInt32LE(pos + 18);
  const uncompressedSize = buf.readUInt32LE(pos + 22);
  const fileNameLength = buf.readUInt16LE(pos + 26);
  const extraFieldLength = buf.readUInt16LE(pos + 28);
  
  const fileName = buf.toString("utf8", pos + 30, pos + 30 + fileNameLength);
  
  if (fileName.includes("qp_")) {
    console.log(`\n  FOUND at offset ${pos}: ${fileName}`);
    console.log(`    compression: ${compressionMethod}, compressed: ${compressedSize}, uncompressed: ${uncompressedSize}`);
    found++;
  }
}

if (found === 0) {
  console.log("No qp_ entries in any local file headers");
  
  // Also search for "qp_" string anywhere in the file
  const str = buf.toString("latin1");
  let idx = str.indexOf("qp_");
  while (idx !== -1) {
    const ctx = str.substring(Math.max(0, idx - 20), Math.min(str.length, idx + 80));
    console.log(`\n  "qp_" found at byte ${idx}: ${ctx.replace(/[^\x20-\x7e]/g, ".")}`);
    idx = str.indexOf("qp_", idx + 1);
    if (idx > str.length) break;
  }
  
  // Show first 5 file entries
  console.log("\n=== First 5 file entries ===");
  for (let i = 0; i < Math.min(5, positions.length); i++) {
    const pos = positions[i];
    const fileNameLength = buf.readUInt16LE(pos + 26);
    const extraFieldLength = buf.readUInt16LE(pos + 28);
    const fileName = buf.toString("utf8", pos + 30, pos + 30 + fileNameLength);
    const compressedSize = buf.readUInt32LE(pos + 18);
    console.log(`  [${i}] ${fileName} (${compressedSize} bytes compressed)`);
  }
}
