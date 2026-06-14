const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SRC = "c:\\Users\\ted97\\Desktop\\模組開發\\文靜資源包\\assets";
const DST = "c:\\Users\\ted97\\Desktop\\模組開發\\倉儲網頁\\public\\textures\\assets";

async function fixPng(srcPath, dstPath) {
  try {
    const buf = fs.readFileSync(srcPath);
    // Try to decode with sharp (tolerant decoder)
    const img = sharp(buf);
    const meta = await img.metadata();
    // Re-encode as proper PNG
    const fixed = await img.png().toBuffer();
    const dstDir = path.dirname(dstPath);
    if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
    fs.writeFileSync(dstPath, fixed);
    return { ok: true, w: meta.width, h: meta.height };
  } catch (e) {
    return { ok: false, error: e.message };
  }
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

async function main() {
  // First test with yellow.png
  const testSrc = path.join(SRC, "qp_item", "textures", "equipment", "necklace", "yellow.png");
  const testDst = path.join(DST, "qp_item", "textures", "equipment", "necklace", "yellow.png");
  console.log("Testing yellow.png...");
  const testResult = await fixPng(testSrc, testDst);
  console.log("Result:", testResult);

  if (!testResult.ok) {
    console.log("sharp cannot decode this file. Trying raw approach...");
    // If sharp fails, let's see what's in the file
    const buf = fs.readFileSync(testSrc);
    console.log("File size:", buf.length);
    console.log("First 50 bytes:", buf.slice(0, 50).toString("hex"));
    return;
  }

  // If test works, fix all PNGs
  console.log("\nTest passed! Fixing all PNGs...");
  const namespaces = fs.readdirSync(SRC, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name);

  let fixed = 0, failed = 0;
  for (const ns of namespaces) {
    const texDir = path.join(SRC, ns, "textures");
    if (!fs.existsSync(texDir)) continue;
    const pngs = walk(texDir);
    for (const srcFile of pngs) {
      const rel = path.relative(path.join(SRC, ns), srcFile).replace(/\\/g, "/");
      const dstFile = path.join(DST, ns, rel);
      const result = await fixPng(srcFile, dstFile);
      if (result.ok) fixed++;
      else { failed++; if (failed <= 5) console.log(`FAIL: ${ns}/${rel}: ${result.error}`); }
    }
  }
  console.log(`\nDone: fixed=${fixed}, failed=${failed}`);
}

main();
