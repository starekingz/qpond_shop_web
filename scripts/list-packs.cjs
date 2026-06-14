const fs = require("fs");
const path = require("path");

const base = path.join(process.env.APPDATA, ".minecraft", "server-resource-packs");
const dirs = fs.readdirSync(base).filter(d => fs.statSync(path.join(base, d)).isDirectory());

for (const dir of dirs) {
  const dirPath = path.join(base, dir);
  const items = fs.readdirSync(dirPath);
  console.log(`\n${dir}/`);
  for (const item of items) {
    const fp = path.join(dirPath, item);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) {
      const sub = fs.readdirSync(fp);
      console.log(`  ${item}/ (${sub.length} items)`);
      // Check deeper
      for (const s of sub.slice(0, 5)) {
        const sp = path.join(fp, s);
        if (fs.statSync(sp).isDirectory()) {
          console.log(`    ${s}/ (${fs.readdirSync(sp).length} items)`);
        } else {
          console.log(`    ${s} (${fs.statSync(sp).size}B)`);
        }
      }
    } else {
      console.log(`  ${item} (${stat.size}B)`);
    }
  }
}
