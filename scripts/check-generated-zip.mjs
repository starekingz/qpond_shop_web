import AdmZip from "adm-zip";

const zip = new AdmZip("c:\\Users\\ted97\\AppData\\Roaming\\.minecraft\\resourcepacks\\generated.zip");
const entries = zip.getEntries();
console.log(`Total entries: ${entries.length}`);

const namespaces = new Set();
const qpEntries = [];
for (const e of entries) {
  const m = e.entryName.match(/^assets\/([^/]+)\//);
  if (m) namespaces.add(m[1]);
  if (e.entryName.includes("qp_weapon") || e.entryName.includes("qp_item") || e.entryName.includes("qp_tools")) {
    qpEntries.push(e.entryName);
  }
}

console.log(`Namespaces: ${[...namespaces].sort().join(", ")}`);
console.log(`\nqp_* entries: ${qpEntries.length}`);
qpEntries.slice(0, 20).forEach(e => console.log("  " + e));
if (qpEntries.length > 20) console.log(`  ... and ${qpEntries.length - 20} more`);
