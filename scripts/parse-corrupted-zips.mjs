/**
 * Parse ZIP files that have an empty EOCD prefix (PK\x05\x06 at start)
 * These are valid ZIPs but adm-zip can't handle them.
 * This script reads the raw local file headers to extract entries.
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { inflateRawSync } from "zlib";

const PACKS_DIR = join(homedir(), "AppData", "Roaming", ".minecraft", "server-resource-packs");
const OUTPUT_DIR = join(process.cwd(), "public", "textures");

const corruptedFiles = [
  "6818732ec7aca215e3cb9a8b62572c02aced3217",
  "c9a4f033cbe109b75cef563335e05f613ecf236b"
];

function parseZipRaw(buf) {
  const entries = [];
  
  // Find first PK\x03\x04 (local file header)
  let offset = 0;
  while (offset < buf.length - 4) {
    if (buf[offset] === 0x50 && buf[offset+1] === 0x4B && buf[offset+2] === 0x03 && buf[offset+3] === 0x04) {
      break;
    }
    offset++;
  }
  
  // Parse local file headers
  while (offset < buf.length - 30) {
    if (buf[offset] !== 0x50 || buf[offset+1] !== 0x4B || buf[offset+2] !== 0x03 || buf[offset+3] !== 0x04) {
      break;
    }
    
    const compressionMethod = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const uncompressedSize = buf.readUInt32LE(offset + 22);
    const fileNameLength = buf.readUInt16LE(offset + 26);
    const extraFieldLength = buf.readUInt16LE(offset + 28);
    
    const fileNameStart = offset + 30;
    const fileName = buf.toString("utf8", fileNameStart, fileNameStart + fileNameLength);
    const dataStart = fileNameStart + fileNameLength + extraFieldLength;
    
    if (dataStart + compressedSize > buf.length) break;
    
    const compressedData = buf.subarray(dataStart, dataStart + compressedSize);
    
    entries.push({
      fileName,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      compressedData,
      isDirectory: fileName.endsWith("/"),
    });
    
    offset = dataStart + compressedSize;
  }
  
  return entries;
}

function getData(entry) {
  if (entry.compressionMethod === 0) {
    // Stored (no compression)
    return entry.compressedData;
  } else if (entry.compressionMethod === 8) {
    // Deflated
    try {
      return inflateRawSync(entry.compressedData);
    } catch {
      return null;
    }
  }
  return null;
}

for (const file of corruptedFiles) {
  const fullPath = join(PACKS_DIR, file);
  const buf = readFileSync(fullPath);
  const sizeMB = (buf.length / 1024 / 1024).toFixed(2);
  
  console.log(`\n=== ${file} (${sizeMB} MB) ===`);
  
  const entries = parseZipRaw(buf);
  console.log(`Parsed ${entries.length} entries`);
  
  // Collect namespaces
  const namespaces = new Set();
  const qpEntries = [];
  
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const m = entry.fileName.match(/^assets\/([^/]+)\//);
    if (m) namespaces.add(m[1]);
    if (entry.fileName.includes("qp_")) {
      qpEntries.push(entry);
    }
  }
  
  console.log(`Namespaces: ${[...namespaces].sort().join(", ")}`);
  
  if (qpEntries.length > 0) {
    console.log(`\n*** qp_ entries (${qpEntries.length}): ***`);
    qpEntries.slice(0, 30).forEach(e => console.log(`  ${e.fileName} (${e.compressedSize} bytes)`));
    if (qpEntries.length > 30) console.log(`  ... and ${qpEntries.length - 30} more`);
  } else {
    console.log(`No qp_ entries found`);
  }
  
  // Extract texture entries
  let extracted = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const texMatch = entry.fileName.match(/^(assets\/[^/]+\/textures\/(?:items?|block)\/.+\.png)$/i);
    if (!texMatch) continue;
    
    const data = getData(entry);
    if (!data) continue;
    
    const outputPath = join(OUTPUT_DIR, texMatch[1]);
    mkdirSync(join(outputPath, ".."), { recursive: true });
    writeFileSync(outputPath, data);
    extracted++;
  }
  
  console.log(`Extracted ${extracted} textures`);
}
