import AdmZip from "adm-zip";
import { readFileSync } from "fs";

const buf = readFileSync("C:\\temp\\mc.jar");
const zip = new AdmZip(buf);

// Read ClientCommonNetworkHandler methods
const cph = zip.getEntry("net/minecraft/client/network/ClientCommonNetworkHandler.class");
if (cph) {
  const data = cph.getData();
  const text = data.toString("utf8");
  // Find method names containing "ResourcePack" or "resourcePack"
  const methods = text.match(/on[A-Za-z]*[Rr]esource[Pp]ack[A-Za-z]*/g) || [];
  console.log("ClientCommonNetworkHandler methods with ResourcePack:");
  [...new Set(methods)].forEach(m => console.log("  " + m));
  
  // Also find all "on" methods
  const onMethods = text.match(/on[A-Z][A-Za-z]{3,30}/g) || [];
  console.log("\nClientCommonNetworkHandler all on* methods:");
  [...new Set(onMethods)].sort().forEach(m => console.log("  " + m));
}

// Read ServerResourcePackLoader methods
console.log("\n=== ServerResourcePackLoader ===");
const srl = zip.getEntry("net/minecraft/client/resource/server/ServerResourcePackLoader.class");
if (srl) {
  const data = srl.getData();
  const text = data.toString("utf8");
  const methods = text.match(/[a-z][A-Za-z]{5,40}/g) || [];
  const unique = [...new Set(methods)].filter(m => 
    m.toLowerCase().includes("resource") || 
    m.toLowerCase().includes("pack") || 
    m.toLowerCase().includes("download") ||
    m.toLowerCase().includes("load") ||
    m.toLowerCase().includes("accept")
  );
  console.log("Relevant methods:");
  unique.forEach(m => console.log("  " + m));
}

// Read ResourcePackSendS2CPacket fields
console.log("\n=== ResourcePackSendS2CPacket ===");
const pkt = zip.getEntry("net/minecraft/network/packet/s2c/common/ResourcePackSendS2CPacket.class");
if (pkt) {
  const data = pkt.getData();
  const text = data.toString("utf8");
  // Find field/method names
  const names = text.match(/[a-z][A-Za-z]{2,30}/g) || [];
  const unique = [...new Set(names)].filter(m => 
    m.toLowerCase().includes("url") || 
    m.toLowerCase().includes("hash") || 
    m.toLowerCase().includes("id") || 
    m.toLowerCase().includes("required") ||
    m.toLowerCase().includes("prompt")
  );
  console.log("Relevant names:");
  unique.forEach(m => console.log("  " + m));
}
