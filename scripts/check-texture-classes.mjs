import AdmZip from "adm-zip";
import { readFileSync } from "fs";

const buf = readFileSync("C:\\temp\\mc.jar");
const zip = new AdmZip(buf);

// Check NativeImageBackedTexture
console.log("=== NativeImageBackedTexture ===");
const nib = zip.getEntry("net/minecraft/client/texture/NativeImageBackedTexture.class");
if (nib) {
  const text = nib.getData().toString("latin1");
  const methods = [...new Set(text.match(/[a-z][A-Za-z0-9]{2,30}/g) || [])].sort();
  methods.forEach(m => console.log("  " + m));
}

// Check what class_1049 (the texture type from log) actually is
console.log("\n=== Looking for class_1049 ===");
// class_1049 in Yarn maps to something specific
const entries = zip.getEntries().filter(e => e.entryName.includes("class_1049"));
entries.forEach(e => console.log("  Found: " + e.entryName));

// Check TextureManager more carefully for dumpDynamicTextures
console.log("\n=== TextureManager dumpDynamicTextures ===");
const tm = zip.getEntry("net/minecraft/client/texture/TextureManager.class");
if (tm) {
  const text = tm.getData().toString("latin1");
  // Look for dumpDynamicTextures and related methods
  const methods = [...new Set(text.match(/[a-z][A-Za-z0-9]{3,30}/g) || [])].sort();
  methods.filter(m => m.includes("dump") || m.includes("Dump") || m.includes("dynamic") || m.includes("register") || m.includes("allTextures")).forEach(m => console.log("  " + m));
}

// Check AbstractTexture for image-related methods
console.log("\n=== AbstractTexture image methods ===");
const at = zip.getEntry("net/minecraft/client/texture/AbstractTexture.class");
if (at) {
  const text = at.getData().toString("latin1");
  const methods = [...new Set(text.match(/[a-z][A-Za-z0-9]{2,30}/g) || [])].sort();
  methods.filter(m => m.includes("image") || m.includes("Image") || m.includes("native") || m.includes("Native") || m.includes("pixel") || m.includes("data")).forEach(m => console.log("  " + m));
}

// Check if there's a way to enumerate TextureManager textures
console.log("\n=== TextureManager - all strings ===");
if (tm) {
  const text = tm.getData().toString("latin1");
  // Find texture map references
  const matches = text.match(/textures[a-zA-Z]*/g) || [];
  [...new Set(matches)].forEach(m => console.log("  " + m));
}
