import AdmZip from "adm-zip";
import { readFileSync } from "fs";

const buf = readFileSync("C:\\temp\\mc.jar");
const zip = new AdmZip(buf);
const entries = zip.getEntries().map(e => e.entryName);

// Find ClientPlayNetworkHandler related
console.log("=== ClientPlayNetworkHandler ===");
entries.filter(e => e.includes("ClientPlayNetworkHandler") && !e.includes("$")).forEach(e => console.log(e));

// Find ResourcePack related classes
console.log("\n=== ResourcePack classes ===");
entries.filter(e => e.includes("ResourcePack") && e.endsWith(".class") && !e.includes("$")).forEach(e => console.log(e));

// Find ServerResourcePack
console.log("\n=== ServerResourcePack ===");
entries.filter(e => e.includes("ServerResourcePack") && e.endsWith(".class")).forEach(e => console.log(e));

// Find ResourcePackDownloader
console.log("\n=== ResourcePackDownloader ===");
entries.filter(e => e.includes("ResourcePackDownload") && e.endsWith(".class")).forEach(e => console.log(e));

// Find anything related to resource pack sending/handling
console.log("\n=== onResourcePack / onServerResourcePack ===");
entries.filter(e => e.includes("ResourcePack") && e.endsWith(".class") && !e.includes("$")).forEach(e => console.log(e));
