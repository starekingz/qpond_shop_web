import { readdirSync, statSync } from "fs";
import { join } from "path";

const base = "c:\\Users\\ted97\\Desktop\\模組開發\\倉儲網頁\\public\\textures\\assets";
const nsList = ["qp_weapon", "qp_cosmetics", "qp_item", "qp_gui", "qp_tools", "modelengine", "mcicons"];

for (const ns of nsList) {
  const nsDir = join(base, ns, "textures", "item");
  let files = [];
  try {
    function walk(d) {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(d, e.name));
        else if (e.name.endsWith(".png")) files.push(join(d, e.name));
      }
    }
    walk(nsDir);
  } catch {}
  
  if (files.length === 0) { console.log(`${ns}: no PNGs`); continue; }
  
  const sizes = new Map();
  for (const f of files) {
    const s = statSync(f).size;
    sizes.set(s, (sizes.get(s) || 0) + 1);
  }
  const minSize = Math.min(...files.map(f => statSync(f).size));
  const maxSize = Math.max(...files.map(f => statSync(f).size));
  console.log(`${ns}: ${files.length} PNGs, sizes: ${[...sizes.entries()].map(([s,c]) => `${s}B×${c}`).join(", ")}`);
}
