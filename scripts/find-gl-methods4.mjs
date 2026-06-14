import AdmZip from "adm-zip";
import { readFileSync } from "fs";

const buf = readFileSync("C:\\temp\\mc.jar");
const zip = new AdmZip(buf);

// Check GlStateManager - find ALL methods containing "bind" or "Texture"
console.log("=== GlStateManager ALL methods ===");
const gsm = zip.getEntry("com/mojang/blaze3d/opengl/GlStateManager.class");
if (gsm) {
  const text = gsm.getData().toString("latin1");
  const methods = [...new Set(text.match(/[a-z][A-Za-z0-9]{3,30}/g) || [])].sort();
  methods.forEach(m => console.log("  " + m));
}

// Also check if there's a simpler method on TextureManager or MinecraftClient
console.log("\n=== TextureManager ===");
const tm = zip.getEntry("net/minecraft/client/texture/TextureManager.class");
if (tm) {
  const text = tm.getData().toString("latin1");
  const methods = [...new Set(text.match(/[a-z][A-Za-z0-9]{3,30}/g) || [])].sort();
  methods.filter(m => m.includes("texture") || m.includes("Texture") || m.includes("get") || m.includes("register")).forEach(m => console.log("  " + m));
}
