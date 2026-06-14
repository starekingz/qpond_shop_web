import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const dir = "c:\\Users\\ted97\\Desktop\\模組開發\\倉儲網頁\\public\\textures\\assets\\qp_weapon\\textures\\item\\staff";
const files = readdirSync(dir).filter(f => f.endsWith(".png"));

for (const f of files.slice(0, 3)) {
  const path = join(dir, f);
  const buf = readFileSync(path);
  const stat = statSync(path);
  console.log(`\n=== ${f} (${stat.size} bytes) ===`);
  console.log("Header:", buf.subarray(0, 8).toString("hex"));
  console.log("Is PNG:", buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47);
  
  // Parse IHDR chunk
  if (buf.length > 24) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    const bitDepth = buf[24];
    const colorType = buf[25];
    console.log(`IHDR: ${width}x${height}, bitDepth=${bitDepth}, colorType=${colorType}`);
  }
  
  // Check if all pixels are the same (transparent/black)
  console.log("Full hex dump (first 64 bytes):", buf.subarray(0, Math.min(64, buf.length)).toString("hex"));
}
