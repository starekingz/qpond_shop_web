const fs = require("fs");
const path = require("path");

const SRC = "c:\\Users\\ted97\\Desktop\\模組開發\\文靜資源包\\assets";

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

// qp_weapon structure
const weaponDir = path.join(SRC, "qp_weapon");
const allFiles = walk(weaponDir);
const exts = new Map();
for (const f of allFiles) {
  const ext = path.extname(f);
  exts.set(ext, (exts.get(ext) || 0) + 1);
}
console.log("=== qp_weapon ===");
console.log("Extensions:", Object.fromEntries(exts));
console.log("Total files:", allFiles.length);

// Show JSON files in qp_weapon
const jsonFiles = allFiles.filter(f => f.endsWith(".json"));
console.log("\nJSON files:", jsonFiles.length);
for (const f of jsonFiles) {
  const rel = path.relative(weaponDir, f).replace(/\\/g, "/");
  console.log("  " + rel);
}

// Show one sample model JSON
if (jsonFiles.length > 0) {
  const sample = jsonFiles[0];
  const content = fs.readFileSync(sample, "utf-8");
  console.log("\n=== Sample: " + path.relative(weaponDir, sample) + " ===");
  console.log(content.substring(0, 1000));
}

// Check modelengine namespace - look for bow/dark model
console.log("\n=== modelengine/items/ structure ===");
const meDir = path.join(SRC, "modelengine", "items");
if (fs.existsSync(meDir)) {
  const meDirs = fs.readdirSync(meDir, { withFileTypes: true }).filter(d => d.isDirectory());
  console.log("Model dirs:", meDirs.length);
  // Find weapon-related models
  const weaponModels = meDirs.filter(d => 
    d.name.includes("bow") || d.name.includes("sword") || d.name.includes("dagger") ||
    d.name.includes("spear") || d.name.includes("staff") || d.name.includes("tome") ||
    d.name.includes("dark") || d.name.includes("fire") || d.name.includes("ice")
  );
  console.log("Weapon-related:", weaponModels.map(d => d.name));
  
  // List all model dirs
  meDirs.slice(0, 30).forEach(d => console.log("  " + d.name));
  if (meDirs.length > 30) console.log("  ... and " + (meDirs.length - 30) + " more");
}

// Check for bow/dark related model
console.log("\n=== Searching for 'dark' in modelengine ===");
const meAll = walk(path.join(SRC, "modelengine"));
const darkFiles = meAll.filter(f => path.basename(f).toLowerCase().includes("dark"));
for (const f of darkFiles) {
  console.log("  " + path.relative(SRC, f).replace(/\\/g, "/"));
}
