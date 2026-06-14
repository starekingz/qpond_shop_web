const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const zlib = require("zlib");

const base = path.join(process.env.APPDATA, ".minecraft", "server-resource-packs");
const files = fs.readdirSync(base).filter(f => {
  const s = fs.statSync(path.join(base, f));
  return !s.isDirectory();
});

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

for (const f of files) {
  const fp = path.join(base, f);
  const size = fs.statSync(fp).size;
  try {
    const zip = new AdmZip(fp);
    const entries = zip.getEntries();
    const hasQp = entries.some(e => e.entryName.includes("qp_item") || e.entryName.includes("qp_weapon"));
    console.log(`\n${f} (${(size/1024/1024).toFixed(1)}MB, ${entries.length} entries${hasQp ? ' HAS QP!' : ''})`);
    
    if (hasQp) {
      // Find yellow.png
      const yellow = entries.find(e => e.entryName.includes("equipment/necklace/yellow.png"));
      if (yellow) {
        const data = yellow.getData();
        console.log(`  yellow.png: ${data.length} bytes`);
        console.log(`  sig: ${data.slice(0, 8).toString("hex")}`);
        
        // Check IHDR CRC
        const ihdrLen = data.readUInt32BE(8);
        const ihdrCrcPos = 8 + 4 + 4 + ihdrLen;
        const storedCrc = data.readUInt32BE(ihdrCrcPos);
        const typeAndData = Buffer.concat([data.slice(12, 16), data.slice(16, 16 + ihdrLen)]);
        const computedCrc = crc32(typeAndData);
        console.log(`  IHDR CRC: stored=${storedCrc.toString(16)} computed=${computedCrc.toString(16)} ${storedCrc === computedCrc ? 'OK' : 'MISMATCH'}`);
        
        // Find and test IDAT
        let off = 8;
        while (off < data.length) {
          const len = data.readUInt32BE(off);
          const type = data.slice(off + 4, off + 8).toString("ascii");
          if (type === "IDAT") {
            const idatData = data.slice(off + 8, off + 8 + len);
            try {
              const dec = zlib.inflateSync(idatData);
              console.log(`  IDAT: OK (${dec.length} decompressed bytes)`);
            } catch (e) {
              console.log(`  IDAT: FAILED (${e.message})`);
            }
          }
          off += 12 + len;
        }
      }
    }
  } catch (e) {
    console.log(`\n${f}: not a zip (${e.message.substring(0, 50)})`);
  }
}
