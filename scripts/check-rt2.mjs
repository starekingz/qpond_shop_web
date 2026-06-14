import AdmZip from "adm-zip";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// Find the jar manually
function findJar(dir) {
  try {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (f.isDirectory()) {
        const r = findJar(join(dir, f.name));
        if (r) return r;
      } else if (f.name.startsWith("minecraft-merged") && f.name.endsWith(".jar") && f.name.includes("yarn")) {
        return join(dir, f.name);
      }
    }
  } catch {}
  return null;
}

const jarPath = findJar("c:\\Users\\ted97\\Desktop\\模組開發\\shop mod\\.gradle");
console.log("JAR:", jarPath);

const buf = readFileSync(jarPath);
const zip = new AdmZip(buf);

// Check ResourceTexture superclass
const rt = zip.getEntry("net/minecraft/client/texture/ResourceTexture.class");
if (rt) {
  const text = rt.getData().toString("latin1");
  const refs = [...text.matchAll(/net\/minecraft\/client\/texture\/[A-Za-z0-9_]+/g)].map(m => m[0]);
  console.log("=== ResourceTexture class refs ===");
  [...new Set(refs)].forEach(c => console.log("  " + c));
  
  const fields = [...text.matchAll(/Lnet\/minecraft\/[A-Za-z0-9_/]+;/g)].map(m => m[0]);
  console.log("\n=== ResourceTexture field types ===");
  [...new Set(fields)].forEach(f => console.log("  " + f));
} else {
  console.log("ResourceTexture NOT FOUND in Yarn jar");
}

// Also check AbstractTexture 
const at = zip.getEntry("net/minecraft/client/texture/AbstractTexture.class");
if (at) {
  const text = at.getData().toString("latin1");
  const fields = [...text.matchAll(/Lnet\/minecraft\/[A-Za-z0-9_/]+;/g)].map(m => m[0]);
  console.log("\n=== AbstractTexture field types ===");
  [...new Set(fields)].forEach(f => console.log("  " + f));
}

// Check NativeImageBackedTexture
const nib = zip.getEntry("net/minecraft/client/texture/NativeImageBackedTexture.class");
if (nib) {
  const text = nib.getData().toString("latin1");
  const fields = [...text.matchAll(/Lnet\/minecraft\/[A-Za-z0-9_/]+;/g)].map(m => m[0]);
  console.log("\n=== NativeImageBackedTexture field types ===");
  [...new Set(fields)].forEach(f => console.log("  " + f));
}
