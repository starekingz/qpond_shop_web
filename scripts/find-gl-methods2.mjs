import AdmZip from "adm-zip";
import { readFileSync } from "fs";

const buf = readFileSync("C:\\temp\\mc.jar");
const zip = new AdmZip(buf);

// Check GpuTexture class
console.log("=== GpuTexture ===");
const entries = zip.getEntries().filter(e => e.entryName.includes("GpuTexture") && !e.entryName.includes("$"));
entries.forEach(e => {
  console.log("  File: " + e.entryName);
  const text = e.getData().toString("latin1");
  const methods = [...new Set(text.match(/[a-z][A-Za-z0-9]{2,30}/g) || [])].sort();
  methods.forEach(m => console.log("    " + m));
});

// Check GlStateManager more carefully - what are the parameter types?
console.log("\n=== GlStateManager bindTexture signatures ===");
const gsm = zip.getEntry("com/mojang/blaze3d/opengl/GlStateManager.class");
if (gsm) {
  const text = gsm.getData().toString("latin1");
  // Find strings near "bindTexture" and "activeTexture"
  const lines = text.split(/[\x00-\x08\x0b\x0c\x0e-\x1f]/);
  lines.forEach((line, i) => {
    if (line.includes("bindTexture") || line.includes("activeTexture")) {
      // Show surrounding context
      console.log(`  L${i}: ${line.replace(/[^\x20-\x7e]/g, ".").substring(0, 120)}`);
    }
  });
}

// Check GlTexture class
console.log("\n=== GlTexture ===");
const gtEntries = zip.getEntries().filter(e => e.entryName.includes("GlTexture") && !e.entryName.includes("$") && e.entryName.endsWith(".class"));
gtEntries.forEach(e => {
  console.log("  File: " + e.entryName);
});
