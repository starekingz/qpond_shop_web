import AdmZip from "adm-zip";
import { readFileSync } from "fs";

const buf = readFileSync("C:\\temp\\mc.jar");
const zip = new AdmZip(buf);

// Find class_1049 - check in texture package
const textureClasses = zip.getEntries().filter(e => 
  e.entryName.startsWith("net/minecraft/client/texture/") && 
  e.entryName.endsWith(".class") && 
  !e.entryName.includes("$")
);

console.log("=== Texture classes ===");
for (const entry of textureClasses) {
  const name = entry.entryName.replace("net/minecraft/client/texture/", "").replace(".class", "");
  const data = entry.getData().toString("latin1");
  // Check if this class extends AbstractTexture and has relevant methods
  const extendsAbstract = data.includes("AbstractTexture");
  const hasImage = data.includes("NativeImage") || data.includes("image");
  const hasSave = data.includes("writeTo") || data.includes("save");
  if (extendsAbstract || hasImage) {
    console.log(`  ${name}: extends AbstractTexture=${extendsAbstract}, hasImage=${hasImage}, hasSave=${hasSave}`);
    // Show all methods
    const methods = [...new Set(data.match(/[a-z][A-Za-z0-9]{2,25}/g) || [])].sort();
    methods.filter(m => m.includes("image") || m.includes("Image") || m.includes("save") || m.includes("write") || m.includes("Write") || m.includes("pixel") || m.includes("data") || m.includes("close")).forEach(m => 
      console.log(`    .${m}`)
    );
  }
}

// Also check what class_1049 maps to - search for it as a class name
console.log("\n=== Searching for class_1049 ===");
const c1049 = zip.getEntry("net/minecraft/class_1049.class");
if (c1049) {
  console.log("Found: net/minecraft/class_1049.class");
} else {
  // It might be a Yarn-mapped name. Check if it's in the texture package with that intermediary name
  console.log("Not found as direct class. Checking all texture classes for superclass chain...");
  for (const entry of textureClasses) {
    const data = entry.getData();
    // Read constant pool for class references
    const text = data.toString("latin1");
    if (text.includes("class_1049")) {
      console.log(`  Found reference in: ${entry.entryName}`);
    }
  }
}

// Check ResourceTexture specifically
console.log("\n=== ResourceTexture ===");
const rt = zip.getEntry("net/minecraft/client/texture/ResourceTexture.class");
if (rt) {
  const text = rt.getData().toString("latin1");
  const methods = [...new Set(text.match(/[a-z][A-Za-z0-9]{2,25}/g) || [])].sort();
  console.log("All methods:");
  methods.forEach(m => console.log("  " + m));
}
