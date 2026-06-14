const fs = require("fs");
const path = require("path");

function walk(dir) {
  let results = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) results = results.concat(walk(full));
    else if (f.name.endsWith(".png")) results.push(full);
  }
  return results;
}

const base = "c:\\Users\\ted97\\Desktop\\模組開發\\文靜資源包\\assets\\qp_item\\textures";
const files = walk(base);
console.log("Total qp_item PNGs:", files.length);

files.forEach(f => {
  const rel = f.split("textures\\")[1];
  const size = fs.statSync(f).size;
  console.log(`  ${rel} (${size} bytes)`);
});

// Also check: does equipment/necklace/yellow.png exist?
const test = path.join(base, "equipment", "necklace", "yellow.png");
console.log("\nequipment/necklace/yellow.png exists:", fs.existsSync(test));
if (fs.existsSync(test)) console.log("  size:", fs.statSync(test).size, "bytes");
