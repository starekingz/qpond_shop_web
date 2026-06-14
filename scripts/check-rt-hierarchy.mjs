import AdmZip from "adm-zip";
import { readFileSync } from "fs";

const jarPath = (await import("glob")).sync("c:\\Users\\ted97\\Desktop\\模組開發\\shop mod\\.gradle\\**\\minecraft-merged-*.jar")[0];
console.log("JAR:", jarPath);

const buf = readFileSync(jarPath);
const zip = new AdmZip(buf);

// Find ResourceTexture
const entry = zip.getEntry("net/minecraft/client/texture/ResourceTexture.class");
if (!entry) { console.log("ResourceTexture NOT FOUND"); process.exit(1); }

const text = entry.getData().toString("latin1");

// Find superclass
const texClassRefs = [...text.matchAll(/net\/minecraft\/client\/texture\/[A-Za-z0-9_]+/g)].map(m => m[0]);
console.log("=== Texture class references ===");
[...new Set(texClassRefs)].forEach(c => console.log("  " + c));

// Find NativeImage-related fields
const imageRefs = [...text.matchAll(/class_10[0-9][0-9]/g)].map(m => m[0]);
console.log("\n=== Nearby class refs ===");
[...new Set(imageRefs)].forEach(c => console.log("  " + c));

// Look for field declarations with NativeImage type
const nativeImageRefs = [...text.matchAll(/class_10[0-9]{2}[0-9]*/g)].map(m => m[0]);
console.log("\n=== All class_NNNN refs ===");
[...new Set(nativeImageRefs)].forEach(c => console.log("  " + c));

// Now check the class hierarchy
// Look for TextureContents
if (text.includes("TextureContents") || text.includes("class_1053")) {
  console.log("\nHas TextureContents reference");
}

// Find all fields and their types by looking at descriptor patterns
console.log("\n=== Field descriptors ===");
const fields = [...text.matchAll(/Lnet\/minecraft\/[A-Za-z0-9_/]+;/g)].map(m => m[0]);
[...new Set(fields)].forEach(f => console.log("  " + f));
