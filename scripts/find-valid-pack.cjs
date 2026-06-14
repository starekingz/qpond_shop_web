const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const base = path.join(process.env.APPDATA, ".minecraft", "server-resource-packs");
const dirs = fs.readdirSync(base).filter(d => fs.statSync(path.join(base, d)).isDirectory());

for (const dir of dirs) {
  const dirPath = path.join(base, dir);
  const files = fs.readdirSync(dirPath);
  
  // Check for zip files or extracted directories
  for (const f of files) {
    const fp = path.join(dirPath, f);
    if (f.endsWith(".zip")) {
      try {
        const zip = new AdmZip(fp);
        const entries = zip.getEntries();
        const hasQpItem = entries.some(e => e.entryName.includes("qp_item"));
        if (hasQpItem) {
          console.log(`FOUND: ${dir}/${f} (${entries.length} entries)`);
          // Try to extract yellow.png and validate
          const yellow = entries.find(e => e.entryName.includes("equipment/necklace/yellow.png"));
          if (yellow) {
            const data = yellow.getData();
            console.log(`  yellow.png: ${data.length} bytes`);
            console.log(`  sig: ${data.slice(0, 8).toString("hex")}`);
            // Check IHDR CRC
            const ihdrCrcPos = 8 + 4 + 4 + 13;
            const storedCrc = data.readUInt32BE(ihdrCrcPos);
            console.log(`  IHDR stored CRC: ${storedCrc.toString(16)}`);
            // Try to decompress IDAT
            const zlib = require("zlib");
            // Find IDAT chunk
            let off = 8;
            while (off < data.length) {
              const len = data.readUInt32BE(off);
              const type = data.slice(off + 4, off + 8).toString("ascii");
              if (type === "IDAT") {
                const idatData = data.slice(off + 8, off + 8 + len);
                try {
                  const dec = zlib.inflateSync(idatData);
                  console.log(`  IDAT decompress OK: ${dec.length} bytes`);
                } catch (e) {
                  console.log(`  IDAT decompress FAILED: ${e.message}`);
                }
              }
              off += 12 + len;
            }
          }
          // Also list some entries
          entries.filter(e => e.entryName.includes("qp_item/textures/equipment"))
            .slice(0, 5).forEach(e => console.log(`  ${e.entryName}`));
        }
      } catch (e) {
        // Not a valid zip
      }
    } else if (fs.statSync(fp).isDirectory()) {
      // Check for extracted resource pack
      const qpItemDir = path.join(fp, "assets", "qp_item");
      if (fs.existsSync(qpItemDir)) {
        console.log(`FOUND extracted: ${dir}/${f}/assets/qp_item`);
        const yellowPath = path.join(qpItemDir, "textures", "equipment", "necklace", "yellow.png");
        if (fs.existsSync(yellowPath)) {
          const data = fs.readFileSync(yellowPath);
          console.log(`  yellow.png: ${data.length} bytes`);
          const zlib = require("zlib");
          let off = 8;
          while (off < data.length) {
            const len = data.readUInt32BE(off);
            const type = data.slice(off + 4, off + 8).toString("ascii");
            const storedCrc = data.readUInt32BE(off + 8 + len);
            if (type === "IDAT") {
              const idatData = data.slice(off + 8, off + 8 + len);
              try {
                const dec = zlib.inflateSync(idatData);
                console.log(`  IDAT decompress OK: ${dec.length} bytes`);
              } catch (e) {
                console.log(`  IDAT decompress FAILED: ${e.message}`);
              }
            }
            off += 12 + len;
          }
        }
      }
    }
  }
}
