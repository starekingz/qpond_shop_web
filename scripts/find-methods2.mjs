import AdmZip from "adm-zip";
import { readFileSync } from "fs";

const buf = readFileSync("C:\\temp\\mc.jar");
const zip = new AdmZip(buf);

// Read ResourcePackSendS2CPacket - extract ALL string references
const pkt = zip.getEntry("net/minecraft/network/packet/s2c/common/ResourcePackSendS2CPacket.class");
if (pkt) {
  const data = pkt.getData();
  const text = data.toString("latin1");
  
  // Extract all printable strings (method names, field names)
  const strings = text.match(/[a-zA-Z][a-zA-Z0-9_]{1,40}/g) || [];
  const unique = [...new Set(strings)].sort();
  
  // Filter for likely method/field names (exclude Java keywords, common class names)
  const skip = new Set(['java', 'lang', 'String', 'Object', 'Class', 'UUID', 'UUIDUtil', 
    'PacketByteBuf', 'TextCodecs', 'PacketCodec', 'Packet', 'Boolean', 'Optional',
    'net', 'minecraft', 'network', 'packet', 'text', 'util', 'codecs', 'codec',
    'hash', 'url', 'required', 'prompt', 'uUID', 'hashCode', 'uids',
    'apply', 'encode', 'decode', 'value', 'write', 'read', 'cast', 'codec',
    'PacketCodecs', 'ResourcePackSendS2CPacket', 'ServerResourcePackState',
    'method', 'toString', 'equals', 'init', 'this']);
  
  console.log("=== ResourcePackSendS2CPacket all strings ===");
  unique.filter(s => !skip.has(s) && s.length > 2).forEach(s => console.log("  " + s));
  
  // Also look for UUID-related strings
  console.log("\n=== UUID-related ===");
  unique.filter(s => s.toLowerCase().includes("uuid") || s.toLowerCase().includes("id")).forEach(s => console.log("  " + s));
}

// Also check the ServerResourcePackState class which might have the ID
console.log("\n=== ServerResourcePackState ===");
const entries = zip.getEntries().filter(e => e.entryName.includes("ServerResourcePackState"));
entries.forEach(e => {
  console.log("  Found: " + e.entryName);
  const data = e.getData().toString("latin1");
  const strings = data.match(/[a-zA-Z][a-zA-Z0-9_]{1,40}/g) || [];
  [...new Set(strings)].sort().filter(s => s.length > 3 && !['java', 'lang', 'String', 'Object', 'Class'].includes(s)).forEach(s => console.log("    " + s));
});
