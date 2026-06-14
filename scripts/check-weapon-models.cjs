const fs = require("fs");
const path = require("path");

const SRC = "c:\\Users\\ted97\\Desktop\\模組開發\\文靜資源包\\assets";

// Look for JSON files in qp_weapon namespace
const weaponDir = path.join(SRC, "qp_weapon");
if (!fs.existsSync(weaponDir)) {
  console.log("qp_weapon not found!");
  process.exit(1);
}

function walk(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) results = results.concat(walk(full));
    else results.push(full);
  }
  return results;
}

// List all files in qp_weapon
const allFiles = walk(weaponDir);
console.log("=== qp_weapon structure ===");
const dirs = new Set();
const exts = new Map();
for (const f of allFiles) {
  const rel = path.relative(weaponDir, f).replace(/\\/g, "/");
  const ext = path.extname(f);
  exts.set(ext, (exts.get(ext) || 0) + 1);
  const dir = path.dirname(rel);
  dirs.add(dir);
}
console.log("Extensions:", Object.fromEntries(exts));
console.log("Directories:");
for (const d of [...dirs].sort()) console.log("  " + d);

// Show JSON files
const jsonFiles = allFiles.filter(f => f.endsWith(".json"));
console.log("\n=== JSON files (" + jsonFiles.length + ") ===");
for (const f of jsonFiles.slice(0, 20)) {
  const rel = path.relative(weaponDir, f).replace(/\\/g, "/");
  const content = fs.readFileSync(f, "utf-8");
  console.log(`\n--- ${rel} (${content.length} chars) ---`);
  // Show first 500 chars
  console.log(content.substring(0, 500));
  if (content.length > 500) console.log("...");
}

// Also check for modelengine related dirs in other namespaces
console.log("\n=== Looking for modelengine references ===");
for (const ns of fs.readdirSync(SRC, { withFileTypes: true })) {
  if (!ns.isDirectory()) continue;
  const nsDir = path.join(SRC, ns.name);
  const nsFiles = walk(nsDir).filter(f => f.endsWith(".json") || f.endsWith(".bbmodel"));
  for (const f of nsFiles) {
    const content = fs.readFileSync(f, "utf-8");
    if (content.includes("modelengine") || content.includes("ModelEngine")) {
      console.log("Found:", path.relative(SRC, f).replace(/\\/g, "/"));
    }
  }
}
