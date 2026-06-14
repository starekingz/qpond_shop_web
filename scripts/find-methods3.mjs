import AdmZip from "adm-zip";
import { readFileSync } from "fs";

const sourcesJar = "C:\\temp\\fabric-networking-sources.jar";

try {
  const buf = readFileSync(sourcesJar);
  const zip = new AdmZip(buf);
  const entries = zip.getEntries();
  
  console.log("Total entries:", entries.length);
  
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const content = entry.getData().toString("utf8");
    if (content.includes("ResourcePackSend") || content.includes("onResourcePack") || 
        content.includes("resourcePackSend")) {
      console.log(`\n=== ${entry.entryName} ===`);
      const lines = content.split("\n");
      lines.forEach((line, i) => {
        if (line.includes("ResourcePack") || line.includes(".url()") || line.includes(".id()") || 
            line.includes(".uUID") || line.includes(".hash()") || line.includes(".uuid()")) {
          console.log(`  L${i+1}: ${line.trimEnd()}`);
        }
      });
    }
  }
} catch(e) {
  console.log("Error: " + e.message);
}
