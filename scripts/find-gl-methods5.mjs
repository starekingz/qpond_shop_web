import AdmZip from "adm-zip";
import { readFileSync } from "fs";

const buf = readFileSync("C:\\temp\\mc.jar");
const zip = new AdmZip(buf);

// Check GlTexture - find ALL strings including fields
console.log("=== GlTexture complete analysis ===");
const gt = zip.getEntry("net/minecraft/client/texture/GlTexture.class");
if (gt) {
  const data = gt.getData();
  const text = data.toString("latin1");
  
  // Find strings that look like field/method names
  // Look for descriptor patterns like (I)I, ()I, (II)V etc.
  const allStrings = text.match(/[a-zA-Z_][a-zA-Z0-9_]{0,30}/g) || [];
  const unique = [...new Set(allStrings)].sort();
  
  // Show everything that could be a field or method name
  unique.filter(s => s.length > 1 && s.length < 25 && !s.startsWith("_")).forEach(s => {
    // Skip obvious class/package fragments
    if (['java', 'lang', 'net', 'minecraft', 'com', 'mojang', 'blaze3d', 'client', 'texture', 'opengl', 'fabricmc'].includes(s)) return;
    console.log("  " + s);
  });
  
  // Also search for method descriptors
  console.log("\n=== Method descriptors ===");
  const descriptors = text.match(/\([A-Z][^)]*\)[A-Z]/g) || [];
  [...new Set(descriptors)].forEach(d => console.log("  " + d));
}
