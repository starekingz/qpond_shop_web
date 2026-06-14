import AdmZip from "adm-zip";
import { readFileSync } from "fs";

const buf = readFileSync("C:\\temp\\mc.jar");
const zip = new AdmZip(buf);

// Check AbstractTexture
console.log("=== AbstractTexture ===");
const at = zip.getEntry("net/minecraft/client/texture/AbstractTexture.class");
if (at) {
  const text = at.getData().toString("latin1");
  const methods = text.match(/[a-z][A-Za-z0-9]{2,25}/g) || [];
  const unique = [...new Set(methods)].sort();
  // Filter for gl/id related
  unique.filter(m => m.toLowerCase().includes("gl") || m.toLowerCase().includes("id") || m.toLowerCase().includes("bind")).forEach(m => console.log("  " + m));
}

// Check RenderSystem
console.log("\n=== RenderSystem ===");
const rs = zip.getEntry("com/mojang/blaze3d/systems/RenderSystem.class");
if (rs) {
  const text = rs.getData().toString("latin1");
  const methods = text.match(/[a-z][A-Za-z0-9]{2,30}/g) || [];
  const unique = [...new Set(methods)].sort();
  unique.filter(m => m.toLowerCase().includes("bind") || m.toLowerCase().includes("active") || m.toLowerCase().includes("texture")).forEach(m => console.log("  " + m));
}

// Check GlStateManager
console.log("\n=== GlStateManager ===");
const entries = zip.getEntries().filter(e => e.entryName.includes("GlStateManager") && !e.entryName.includes("$"));
entries.forEach(e => {
  console.log("  Found: " + e.entryName);
  const text = e.getData().toString("latin1");
  const methods = text.match(/[a-z][A-Za-z0-9]{2,30}/g) || [];
  [...new Set(methods)].sort().filter(m => m.toLowerCase().includes("bind") || m.toLowerCase().includes("active") || m.toLowerCase().includes("tex")).forEach(m => console.log("    " + m));
});
