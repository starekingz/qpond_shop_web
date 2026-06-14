import AdmZip from "adm-zip";
import { readFileSync } from "fs";

// Read Minecraft sources jar
const buf = readFileSync("C:\\temp\\mc.jar");
const zip = new AdmZip(buf);

// Find the ResourcePackSendS2CPacket source file (if sources are available)
// Or parse the bytecode to find method signatures

// First, let's check all inner classes of ResourcePackSendS2CPacket
const rpEntries = zip.getEntries().filter(e => 
  e.entryName.includes("ResourcePackSendS2CPacket")
);

console.log("=== ResourcePackSendS2CPacket files ===");
rpEntries.forEach(e => console.log("  " + e.entryName));

// Parse the main class bytecode to find method signatures
const mainClass = zip.getEntry("net/minecraft/network/packet/s2c/common/ResourcePackSendS2CPacket.class");
if (mainClass) {
  const data = mainClass.getData();
  
  // In Java class files, method names are stored in the constant pool
  // Let's search for method-like strings that could be accessor names
  const text = data.toString("latin1");
  
  // Find all potential method names - looking for short lowercase strings
  // that could be record accessor methods
  const potentialMethods = text.match(/\b[a-z][a-zA-Z0-9]{1,20}\b/g) || [];
  const unique = [...new Set(potentialMethods)].sort();
  
  // Filter for likely accessor names
  const likely = unique.filter(m => 
    m === "url" || m === "id" || m === "hash" || m === "required" || 
    m === "prompt" || m === "uuid" || m === "uUID" || m === "packId" ||
    m === "getUrl" || m === "getId" || m === "getHash" || m === "getRequired" ||
    m === "getPrompt" || m === "getUuid"
  );
  
  console.log("\n=== Likely accessor methods ===");
  likely.forEach(m => console.log("  " + m));
  
  // Also search for "uuid" and "id" specifically
  console.log("\n=== All strings containing 'id' or 'uuid' (case-insensitive) ===");
  unique.filter(m => m.toLowerCase().includes("id") && m.length < 20).forEach(m => console.log("  " + m));
}

// Also check the ClientCommonNetworkHandler for onResourcePackSend method signature
console.log("\n=== ClientCommonNetworkHandler onResourcePackSend ===");
const handler = zip.getEntry("net/minecraft/client/network/ClientCommonNetworkHandler.class");
if (handler) {
  const data = handler.getData();
  const text = data.toString("latin1");
  
  // Find the onResourcePackSend method context
  const idx = text.indexOf("onResourcePackSend");
  if (idx !== -1) {
    // Show surrounding bytes as strings
    const context = text.substring(Math.max(0, idx - 100), idx + 200);
    const strings = context.match(/[a-zA-Z][a-zA-Z0-9_]{1,40}/g) || [];
    console.log("Strings near onResourcePackSend:");
    [...new Set(strings)].forEach(s => console.log("  " + s));
  }
}
