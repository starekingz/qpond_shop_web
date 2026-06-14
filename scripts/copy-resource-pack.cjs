const { cpSync, readdirSync, statSync } = require("fs");
const { join } = require("path");

const src = String.raw`c:\Users\ted97\Desktop\模組開發\文靜資源包\assets`;
const dst = String.raw`c:\Users\ted97\Desktop\模組開發\倉儲網頁\public\textures\assets`;

const namespaces = readdirSync(src).filter(n => {
  if (n === "minecraft" || n === "realms") return false;
  return statSync(join(src, n)).isDirectory();
});

console.log(`Copying ${namespaces.length} namespaces from resource pack...`);

for (const ns of namespaces) {
  const srcDir = join(src, ns);
  const dstDir = join(dst, ns);
  cpSync(srcDir, dstDir, { recursive: true, force: true });
  
  // Count PNGs
  let count = 0;
  function countPngs(dir) {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (f.isDirectory()) countPngs(join(dir, f.name));
      else if (f.name.endsWith(".png")) count++;
    }
  }
  countPngs(dstDir);
  console.log(`  ${ns}: ${count} PNGs`);
}
console.log("Done!");
