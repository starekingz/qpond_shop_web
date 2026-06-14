const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

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

function fixPng(srcPath) {
  const buf = fs.readFileSync(srcPath);
  if (buf.length < 8 || buf.slice(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;

  // Parse all chunks
  const chunks = [];
  let offset = 8;
  while (offset + 8 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.slice(offset + 4, offset + 8);
    const typeStr = type.toString("ascii");
    const data = Buffer.alloc(len);
    buf.copy(data, 0, offset + 8, offset + 8 + len);
    chunks.push({ type, typeStr, data });
    offset += 12 + len;
    if (typeStr === "IEND") break;
  }

  // Fix each chunk
  const outParts = [Buffer.from("89504e470d0a1a0a", "hex")]; // PNG signature

  for (const chunk of chunks) {
    let data = chunk.data;

    if (chunk.typeStr === "IDAT") {
      // Try to decompress with raw inflate (skip zlib header)
      try {
        const raw = zlib.inflateRawSync(data.slice(2), { finishFlush: zlib.constants.Z_SYNC_FLUSH });
        // Re-compress with proper zlib wrapper
        data = zlib.deflateSync(raw, { level: 9 });
      } catch (e) {
        // If raw inflate fails too, try standard inflate
        try {
          const raw = zlib.inflateSync(data, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
          data = zlib.deflateSync(raw, { level: 9 });
        } catch (e2) {
          return null; // Can't fix this one
        }
      }
    }

    // Write chunk: length(4) + type(4) + data(len) + crc(4)
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([chunk.type, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(typeAndData), 0);
    outParts.push(lenBuf, typeAndData, crcBuf);
  }

  return Buffer.concat(outParts);
}

function walk(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) results = results.concat(walk(full));
    else if (f.name.endsWith(".png")) results.push(full);
  }
  return results;
}

// Source and destination
const SRC = "c:\\Users\\ted97\\Desktop\\模組開發\\文靜資源包\\assets";
const DST = "c:\\Users\\ted97\\Desktop\\模組開發\\倉儲網頁\\public\\textures\\assets";

const namespaces = fs.readdirSync(SRC, { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name);

let fixed = 0, failed = 0, alreadyOk = 0;

for (const ns of namespaces) {
  const texDir = path.join(SRC, ns, "textures");
  if (!fs.existsSync(texDir)) continue;
  const pngs = walk(texDir);

  for (const srcFile of pngs) {
    const rel = path.relative(path.join(SRC, ns), srcFile).replace(/\\/g, "/");
    const dstFile = path.join(DST, ns, rel);
    const dstDir = path.dirname(dstFile);

    // Check if source PNG has valid CRCs (already OK)
    const srcBuf = fs.readFileSync(srcFile);
    const ihdrLen = srcBuf.readUInt32BE(8);
    const ihdrCrcPos = 8 + 4 + 4 + ihdrLen;
    const storedCrc = srcBuf.readUInt32BE(ihdrCrcPos);
    const typeAndData = srcBuf.slice(12, 12 + ihdrLen);
    const computedCrc = crc32(typeAndData);

    if (storedCrc === computedCrc) {
      // Already valid — just copy
      if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
      fs.writeFileSync(dstFile, srcBuf);
      alreadyOk++;
      continue;
    }

    // Try to fix
    const fixedBuf = fixPng(srcFile);
    if (fixedBuf) {
      if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
      fs.writeFileSync(dstFile, fixedBuf);
      fixed++;
    } else {
      failed++;
      if (failed <= 5) console.log(`FAILED: ${ns}/${rel}`);
    }
  }
}

console.log(`\nResults: already_ok=${alreadyOk}, fixed=${fixed}, failed=${failed}`);

// Verify yellow.png
const testFile = path.join(DST, "qp_item/textures/equipment/necklace/yellow.png");
if (fs.existsSync(testFile)) {
  const testBuf = fs.readFileSync(testFile);
  const ihdrLen2 = testBuf.readUInt32BE(8);
  const storedCrc2 = testBuf.readUInt32BE(8 + 4 + 4 + ihdrLen2);
  const typeAndData2 = testBuf.slice(12, 12 + ihdrLen2);
  const computedCrc2 = crc32(typeAndData2);
  console.log(`yellow.png verify: CRC ${storedCrc2.toString(16)} vs ${computedCrc2.toString(16)} ${storedCrc2 === computedCrc2 ? "OK" : "FAIL"}`);
  
  // Also try inflate
  let off = 8;
  while (off < testBuf.length) {
    const len = testBuf.readUInt32BE(off);
    const type = testBuf.slice(off + 4, off + 8).toString("ascii");
    if (type === "IDAT") {
      const idatData = testBuf.slice(off + 8, off + 8 + len);
      try {
        const dec = zlib.inflateSync(idatData);
        console.log(`yellow.png IDAT: decompress OK (${dec.length} bytes)`);
      } catch (e) {
        console.log(`yellow.png IDAT: decompress FAIL (${e.message})`);
      }
    }
    off += 12 + len;
  }
}
