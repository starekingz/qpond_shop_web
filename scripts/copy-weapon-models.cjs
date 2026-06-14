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
  const outParts = [Buffer.from("89504e470d0a1a0a", "hex")];
  for (const chunk of chunks) {
    let data = chunk.data;
    if (chunk.typeStr === "IDAT") {
      try {
        const raw = zlib.inflateRawSync(data.slice(2), { finishFlush: zlib.constants.Z_SYNC_FLUSH });
        data = zlib.deflateSync(raw, { level: 9 });
      } catch (e) {
        try {
          const raw = zlib.inflateSync(data, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
          data = zlib.deflateSync(raw, { level: 9 });
        } catch (e2) { return null; }
      }
    }
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([chunk.type, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(typeAndData), 0);
    outParts.push(lenBuf, typeAndData, crcBuf);
  }
  return Buffer.concat(outParts);
}

const SRC = "c:\\Users\\ted97\\Desktop\\模組開發\\文靜資源包\\assets";
const DST = "c:\\Users\\ted97\\Desktop\\模組開發\\倉儲網頁\\public\\textures\\assets";

// Copy qp_weapon models (JSON files)
const modelDir = path.join(SRC, "qp_weapon", "models");
let jsonCount = 0;
function copyDir(srcDir, dstDir) {
  if (!fs.existsSync(srcDir)) return;
  for (const f of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, f.name);
    const dstPath = path.join(dstDir, f.name);
    if (f.isDirectory()) {
      if (!fs.existsSync(dstPath)) fs.mkdirSync(dstPath, { recursive: true });
      copyDir(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
      jsonCount++;
    }
  }
}
copyDir(modelDir, path.join(DST, "qp_weapon", "models"));
console.log(`Copied ${jsonCount} model JSON files`);

// Also copy & fix qp_weapon textures (items JSON)
const itemsDir = path.join(SRC, "qp_weapon", "items");
let itemCount = 0;
copyDir(itemsDir, path.join(DST, "qp_weapon", "items"));
console.log(`Copied ${itemCount || jsonCount} item JSON files`);

// Fix qp_weapon texture PNGs (they have bad CRC too)
const texDir = path.join(SRC, "qp_weapon", "textures");
let fixed = 0, alreadyOk = 0, failed = 0;
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
for (const srcFile of walk(texDir)) {
  const rel = path.relative(path.join(SRC, "qp_weapon"), srcFile).replace(/\\/g, "/");
  const dstFile = path.join(DST, "qp_weapon", rel);
  const dstDir = path.dirname(dstFile);
  if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
  
  const srcBuf = fs.readFileSync(srcFile);
  const ihdrLen = srcBuf.readUInt32BE(8);
  const ihdrCrcPos = 8 + 4 + 4 + ihdrLen;
  const storedCrc = srcBuf.readUInt32BE(ihdrCrcPos);
  const typeAndData = srcBuf.slice(12, 12 + ihdrLen);
  const computedCrc = crc32(typeAndData);
  
  if (storedCrc === computedCrc) {
    fs.writeFileSync(dstFile, srcBuf);
    alreadyOk++;
  } else {
    const fixedBuf = fixPng(srcFile);
    if (fixedBuf) {
      fs.writeFileSync(dstFile, fixedBuf);
      fixed++;
    } else {
      failed++;
      console.log(`FAILED: ${rel}`);
    }
  }
}
console.log(`Textures: ok=${alreadyOk}, fixed=${fixed}, failed=${failed}`);
