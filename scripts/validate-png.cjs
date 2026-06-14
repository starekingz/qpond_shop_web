const fs = require("fs");
const zlib = require("zlib");

const files = [
  "c:/Users/ted97/Desktop/模組開發/倉儲網頁/public/textures/assets/qp_item/textures/equipment/necklace/yellow.png",
  "c:/Users/ted97/Desktop/模組開發/倉儲網頁/public/textures/assets/minecraft/textures/item/paper.png",
  "c:/Users/ted97/Desktop/模組開發/倉儲網頁/public/textures/assets/minecraft/textures/item/diamond.png",
];

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

for (const filePath of files) {
  const name = filePath.split("/").pop();
  const buf = fs.readFileSync(filePath);
  console.log(`\n=== ${name} (${buf.length} bytes) ===`);

  // Check PNG signature
  const sig = buf.slice(0, 8).toString("hex");
  console.log("Signature:", sig, sig === "89504e470d0a1a0a" ? "OK" : "INVALID!");

  // Parse chunks
  let offset = 8;
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.slice(offset + 4, offset + 8).toString("ascii");
    const data = buf.slice(offset + 8, offset + 8 + len);
    const storedCrc = buf.readUInt32BE(offset + 8 + len);
    const typeAndData = Buffer.concat([buf.slice(offset + 4, offset + 8), data]);
    const computedCrc = crc32(typeAndData);
    const crcOk = storedCrc === computedCrc;

    console.log(`  Chunk: ${type}, len=${len}, CRC=${storedCrc.toString(16)} vs computed=${computedCrc.toString(16)} ${crcOk ? "OK" : "MISMATCH!"}`);

    if (type === "IHDR") {
      console.log(`    Width: ${data.readUInt32BE(0)}, Height: ${data.readUInt32BE(4)}`);
      console.log(`    Bit depth: ${data[8]}, Color type: ${data[9]}`);
      console.log(`    Compression: ${data[10]}, Filter: ${data[11]}, Interlace: ${data[12]}`);
    }

    if (type === "IDAT") {
      try {
        const decompressed = zlib.inflateSync(data);
        console.log(`    Decompressed: ${decompressed.length} bytes OK`);
      } catch (e) {
        console.log(`    Decompress FAILED: ${e.message}`);
      }
    }

    offset += 12 + len; // 4(len) + 4(type) + len(data) + 4(crc)
  }
}
