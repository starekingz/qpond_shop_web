// Try to read corrupted ZIPs using different approach
import { readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createReadStream } from "fs";
import { pipeline } from "stream/promises";
import { createGunzip } from "zlib";

const PACKS_DIR = join(homedir(), "AppData", "Roaming", ".minecraft", "server-resource-packs");

// Check magic bytes of the corrupted ZIPs
const corruptedFiles = [
  "6818732ec7aca215e3cb9a8b62572c02aced3217",
  "c9a4f033cbe109b75cef563335e05f613ecf236b"
];

for (const file of corruptedFiles) {
  const fullPath = join(PACKS_DIR, file);
  const stat = statSync(fullPath);
  const buf = readFileSync(fullPath);
  
  console.log(`\n--- ${file} (${(stat.size/1024/1024).toFixed(2)} MB) ---`);
  
  // Check first 32 bytes
  const header = buf.slice(0, 32).toString("hex").match(/.{2}/g).join(" ");
  console.log(`First 32 bytes: ${header}`);
  
  // Check magic number
  const magic = buf.readUInt32LE(0);
  console.log(`Magic: 0x${magic.toString(16).padStart(8, "0")}`);
  
  // Check if it's a regular ZIP (PK\x03\x04) or ZIP64 end record
  if (buf[0] === 0x50 && buf[1] === 0x4B) {
    console.log(`ZIP signature: PK\\x${buf[2].toString(16).padStart(2,"0")}\\x${buf[3].toString(16).padStart(2,"0")}`);
    
    if (buf[2] === 0x05 && buf[3] === 0x06) {
      console.log("This is an EMPTY ZIP (end of central directory only)");
    } else if (buf[2] === 0x03 && buf[3] === 0x04) {
      console.log("This is a NORMAL ZIP with local file headers");
    } else if (buf[2] === 0x06 && buf[3] === 0x06) {
      console.log("This is a ZIP64 end of central directory locator");
    } else if (buf[2] === 0x07 && buf[3] === 0x08) {
      console.log("This is a ZIP64 end of central directory record");
    }
  }
  
  // Try to find all PK signatures in the file (local file headers)
  let pkCount = 0;
  let positions = [];
  for (let i = 0; i < Math.min(buf.length, 1000000); i++) {
    if (buf[i] === 0x50 && buf[i+1] === 0x4B && buf[i+2] === 0x03 && buf[i+3] === 0x04) {
      pkCount++;
      if (positions.length < 5) positions.push(i);
    }
  }
  console.log(`Local file header (PK\\x03\\x04) count in first 1MB: ${pkCount}`);
  if (positions.length > 0) console.log(`Positions: ${positions.join(", ")}`);
  
  // Also search for "qp_weapon" string anywhere in the file
  const content = buf.toString("utf8");
  const qpIdx = content.indexOf("qp_weapon");
  if (qpIdx !== -1) {
    console.log(`*** Found "qp_weapon" at byte offset ${qpIdx} ***`);
    // Show surrounding context
    const ctx = content.substring(Math.max(0, qpIdx - 50), Math.min(content.length, qpIdx + 100));
    console.log(`Context: ${ctx}`);
  } else {
    console.log(`"qp_weapon" NOT found in file`);
  }
  
  // Search for "assets/" path
  const assetsIdx = content.indexOf("assets/");
  if (assetsIdx !== -1) {
    const ctx = content.substring(assetsIdx, Math.min(content.length, assetsIdx + 200));
    console.log(`Found "assets/" at offset ${assetsIdx}: ${ctx.substring(0, 100)}`);
  }
}
