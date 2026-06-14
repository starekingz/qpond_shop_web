const fs = require("fs");
const path = require("path");

const base = "c:\\Users\\ted97\\Desktop\\模組開發\\倉儲網頁\\public\\textures\\assets";
const urls = [
  // Model: qp_item:equipment/necklace/yellow
  "qp_item/textures/equipment/necklace/yellow.png",
  "qp_item/textures/item/equipment/necklace/yellow.png",
  "qp_item/textures/block/equipment/necklace/yellow.png",
  // Fallback: minecraft:paper
  "minecraft/textures/paper.png",
  "minecraft/textures/item/paper.png",
  "minecraft/textures/block/paper.png",
];

for (const url of urls) {
  const full = path.join(base, url);
  const exists = fs.existsSync(full);
  console.log(`${exists ? "OK " : "MISS"} ${url} ${exists ? `(${fs.statSync(full).size}B)` : ""}`);
}

// Also check what items DO work - let's look for any qp_item textures that match "item" subfolder pattern
const qpItemTextures = path.join(base, "qp_item", "textures");
console.log("\n--- qp_item/textures/ subfolders ---");
for (const dir of fs.readdirSync(qpItemTextures, { withFileTypes: true })) {
  if (dir.isDirectory()) {
    const count = fs.readdirSync(path.join(qpItemTextures, dir.name)).length;
    console.log(`  ${dir.name}/ (${count} files)`);
  } else {
    console.log(`  ${dir.name}`);
  }
}
