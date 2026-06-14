import AdmZip from "adm-zip";
import { readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const MC_DIR = join(homedir(), "AppData", "Roaming", ".minecraft");
const PACKS_DIR = join(MC_DIR, "server-resource-packs");

console.log("=== Scanning all server-resource-packs for namespaces ===\n");

const files = readdirSync(PACKS_DIR).filter(f => {
  const s = statSync(join(PACKS_DIR, f));
  return s.isFile();
});

for (const file of files) {
  const fullPath = join(PACKS_DIR, file);
  const size = statSync(fullPath).size;
  console.log(`\n--- ${file} (${(size/1024/1024).toFixed(2)} MB) ---`);
  
  if (size < 100) {
    console.log("  Too small, skipping");
    continue;
  }

  try {
    const buf = readFileSync(fullPath);
    const zip = new AdmZip(buf);
    const entries = zip.getEntries();
    
    // Collect all namespaces
    const namespaces = new Set();
    const qpEntries = [];
    
    for (const entry of entries) {
      const path = entry.entryName;
      // Match assets/<namespace>/...
      const m = path.match(/^assets\/([^/]+)\//);
      if (m) namespaces.add(m[1]);
      if (path.includes("qp_weapon") || path.includes("qp_")) {
        qpEntries.push(path);
      }
    }
    
    console.log(`  Namespaces: ${[...namespaces].join(", ")}`);
    console.log(`  Total entries: ${entries.filter(e => !e.isDirectory).length}`);
    
    if (qpEntries.length > 0) {
      console.log(`  *** FOUND qp_weapon entries: ***`);
      qpEntries.slice(0, 20).forEach(e => console.log(`    ${e}`));
      if (qpEntries.length > 20) console.log(`    ... and ${qpEntries.length - 20} more`);
    }
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }
}
