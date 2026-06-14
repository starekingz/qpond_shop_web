import AdmZip from "adm-zip";
import { readFileSync } from "fs";

const buf = readFileSync("C:\\temp\\mc.jar");
const zip = new AdmZip(buf);

// Check GlTexture
console.log("=== GlTexture ===");
const gt = zip.getEntry("net/minecraft/client/texture/GlTexture.class");
if (gt) {
  const text = gt.getData().toString("latin1");
  const methods = [...new Set(text.match(/[a-z][A-Za-z0-9]{2,30}/g) || [])].sort();
  console.log("All methods/fields:");
  methods.forEach(m => console.log("  " + m));
}

// Check GlTextureView
console.log("\n=== GlTextureView ===");
const gtv = zip.getEntry("net/minecraft/client/texture/GlTextureView.class");
if (gtv) {
  const text = gtv.getData().toString("latin1");
  const methods = [...new Set(text.match(/[a-z][A-Za-z0-9]{2,30}/g) || [])].sort();
  console.log("All methods/fields:");
  methods.forEach(m => console.log("  " + m));
}

// Check AbstractTexture more carefully
console.log("\n=== AbstractTexture all ===");
const at = zip.getEntry("net/minecraft/client/texture/AbstractTexture.class");
if (at) {
  const text = at.getData().toString("latin1");
  const methods = [...new Set(text.match(/[a-z][A-Za-z0-9]{2,30}/g) || [])].sort();
  console.log("All methods/fields:");
  methods.forEach(m => console.log("  " + m));
}
