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

function validatePng(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length < 8) return false;
    if (buf.slice(0, 8).toString("hex") !== "89504e470d0a1a0a") return false;
    // Check IHDR CRC
    const ihdrLen = buf.readUInt32BE(8);
    const ihdrCrcPos = 8 + 4 + 4 + ihdrLen;
    const storedCrc = buf.readUInt32BE(ihdrCrcPos);
    const typeAndData = buf.slice(12, 12 + ihdrLen);
    const computed = crc32(typeAndData);
    return storedCrc === computed;
  } catch {
    return false;
  }
}

// Source and destination
const SRC = "c:\\Users\\ted97\\Desktop\\模組開發\\文靜資源包\\assets";
const DST = "c:\\Users\\ted97\\Desktop\\模組開發\\倉儲網頁\\public\\textures\\assets";

// Walk all PNGs in source
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

let copied = 0, skipped = 0, corrupted = 0;
const namespaces = fs.readdirSync(SRC, { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name);

for (const ns of namespaces) {
  const texDir = path.join(SRC, ns, "textures");
  if (!fs.existsSync(texDir)) continue;
  const pngs = walk(texDir);
  for (const srcFile of pngs) {
    const rel = path.relative(path.join(SRC, ns), srcFile).replace(/\\/g, "/");
    const dstFile = path.join(DST, ns, rel);
    const dstDir = path.dirname(dstFile);
    if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });

    // Read source file as binary buffer
    const srcBuf = fs.readFileSync(srcFile);

    // Validate source PNG
    if (!validatePng(srcFile)) {
      console.log(`CORRUPTED SRC: ${ns}/${rel}`);
      corrupted++;
      continue;
    }

    // Write to destination as binary
    fs.writeFileSync(dstFile, srcBuf);
    copied++;
  }
}

console.log(`\nDone: copied=${copied}, skipped=${skipped}, corrupted_src=${corrupted}`);

// Verify a sample
const testFile = path.join(DST, "qp_item/textures/equipment/necklace/yellow.png");
if (fs.existsSync(testFile)) {
  console.log("Verify yellow.png:", validatePng(testFile) ? "VALID" : "STILL CORRUPTED");
}
