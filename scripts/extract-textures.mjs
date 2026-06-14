/**
 * 從正在執行的 Minecraft 中提取材質
 * 來源：
 * 1. server-resource-packs (auto-downloaded by Minecraft)
 * 2. resourcepacks (user-downloaded full packs)
 * 3. captured-packs (captured by mod Mixin - ServerResourcePackSend interceptor)
 * 4. dumped-textures (dumped from ResourceManager via Dump Textures button)
 */

import AdmZip from "adm-zip";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, copyFileSync, readFileSync } from "fs";
import { join, extname } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

const MC_DIR = join(homedir(), "AppData", "Roaming", ".minecraft");
const PACKS_DIR = join(MC_DIR, "server-resource-packs");
const RESOURCE_PACKS_DIR = join(MC_DIR, "resourcepacks");
const CAPTURED_PACKS_DIR = join(MC_DIR, "config", "shopmod", "captured-packs");
const DUMPED_TEXTURES_DIR = join(homedir(), "Desktop", "模組開發", "dumped-textures");
const OUTPUT_DIR = join(process.cwd(), "public", "textures");

function loadZipSafe(packPath) {
  try {
    const zip = new AdmZip(packPath);
    return zip.getEntries();
  } catch {
    return [];
  }
}

/**
 * Load ZIP from buffer, handling the "empty EOCD prefix" issue.
 * Some Minecraft server resource packs start with an empty EOCD record (PK\x05\x06)
 * followed by actual data. adm-zip fails on these because it reads the empty EOCD first.
 */
function loadZipFromBuffer(buf) {
  // First try normal parsing
  try {
    const zip = new AdmZip(buf);
    const entries = zip.getEntries();
    if (entries.length > 0) return entries;
  } catch {}

  // If the buffer starts with PK\x05\x06 (empty EOCD), try skipping it
  if (buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x05 && buf[3] === 0x06) {
    // Find the first local file header (PK\x03\x04)
    for (let i = 4; i < Math.min(buf.length, 100); i++) {
      if (buf[i] === 0x50 && buf[i + 1] === 0x4B && buf[i + 2] === 0x03 && buf[i + 3] === 0x04) {
        // Create a new buffer starting from the local file header
        // We need to reconstruct a valid ZIP by finding the real EOCD
        try {
          const zip = new AdmZip(buf.subarray(i));
          return zip.getEntries();
        } catch {}
      }
    }
  }
  return [];
}

function extractFromEntries(entries, packName) {
  let count = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const entryPath = entry.entryName;

    const textureMatch = entryPath.match(
      /^(assets\/[^/]+\/textures\/(?:items?|block)\/.+\.png)$/i
    );
    if (!textureMatch) continue;

    const relativePath = textureMatch[1];
    const outputPath = join(OUTPUT_DIR, relativePath);
    const outputDir = join(outputPath, "..");

    try {
      const data = entry.getData();
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(outputPath, data);
      count++;
    } catch {
      // skip corrupted entries
    }
  }
  return count;
}

/** Extract ALL namespaces from entries (for diagnostics) */
function getNamespaces(entries) {
  const ns = new Set();
  for (const entry of entries) {
    const m = entry.entryName.match(/^assets\/([^/]+)\//);
    if (m) ns.add(m[1]);
  }
  return [...ns].sort();
}

/** Recursively walk a directory and return all file paths */
function walkDir(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkDir(fullPath));
      } else {
        results.push(fullPath);
      }
    }
  } catch { /* skip */ }
  return results;
}

function main() {
  console.log("=== 全來源材質提取 ===\n");
  mkdirSync(OUTPUT_DIR, { recursive: true });

  let totalExtracted = 0;

  // 1. server-resource-packs (auto-downloaded)
  console.log("--- 伺服器自動下載的資源包 ---");
  if (existsSync(PACKS_DIR)) {
    const packs = readdirSync(PACKS_DIR)
      .filter((n) => { const s = statSync(join(PACKS_DIR, n)); return s.isFile(); })
      .map((n) => ({ name: n, path: join(PACKS_DIR, n), size: statSync(join(PACKS_DIR, n)).size }))
      .sort((a, b) => a.size - b.size);

    for (const pack of packs) {
      const buf = readFileSync(pack.path);
      const entries = loadZipFromBuffer(buf);
      const count = extractFromEntries(entries, pack.name);
      const sizeMB = (pack.size / 1024 / 1024).toFixed(1);
      const nsList = getNamespaces(entries);
      if (count > 0) {
        console.log(`  ${pack.name} (${sizeMB} MB) → ${count} 個材質 [${nsList.join(", ")}]`);
      } else {
        console.log(`  ${pack.name} (${sizeMB} MB) → 無法解析或無材質 (ns: ${nsList.join(", ") || "none"})`);
      }
      totalExtracted += count;
    }
  }

  // 2. resourcepacks folder (user-downloaded full packs)
  console.log("\n--- 使用者手動下載的資源包 ---");
  if (existsSync(RESOURCE_PACKS_DIR)) {
    const zips = readdirSync(RESOURCE_PACKS_DIR)
      .filter((n) => extname(n) === ".zip")
      .map((n) => ({ name: n, path: join(RESOURCE_PACKS_DIR, n), size: statSync(join(RESOURCE_PACKS_DIR, n)).size }))
      .sort((a, b) => a.size - b.size);

    for (const pack of zips) {
      const entries = loadZipSafe(pack.path);
      const count = extractFromEntries(entries, pack.name);
      const sizeMB = (pack.size / 1024 / 1024).toFixed(1);
      if (count > 0) console.log(`  ${pack.name} (${sizeMB} MB) → ${count} 個材質`);
      totalExtracted += count;
    }
  }

  // 3. captured-packs (downloaded by mod Mixin)
  console.log("\n--- Mixin 攔截下載的資源包 ---");
  if (existsSync(CAPTURED_PACKS_DIR)) {
    const packs = readdirSync(CAPTURED_PACKS_DIR)
      .filter((n) => extname(n) === ".zip")
      .map((n) => ({ name: n, path: join(CAPTURED_PACKS_DIR, n), size: statSync(join(CAPTURED_PACKS_DIR, n)).size }));

    if (packs.length === 0) {
      console.log("  (無攔截的資源包，請加入伺服器後重新執行)");
    }

    for (const pack of packs) {
      const buf = readFileSync(pack.path);
      const entries = loadZipFromBuffer(buf);
      const count = extractFromEntries(entries, pack.name);
      const sizeMB = (pack.size / 1024 / 1024).toFixed(1);
      const nsList = getNamespaces(entries);
      console.log(`  ${pack.name} (${sizeMB} MB) → ${count} 個材質 [${nsList.join(", ")}]`);
      totalExtracted += count;
    }
  } else {
    console.log("  (目錄不存在，需要 Mixin 攔截)");
  }

  // 4. Mod-dumped textures (from in-game ResourceManager capture)
  console.log("\n--- 模組傾印的材質 (Dump Textures 按鈕) ---");
  if (existsSync(DUMPED_TEXTURES_DIR)) {
    let dumpCount = 0;
    const namespaces = readdirSync(DUMPED_TEXTURES_DIR).filter(n => {
      try { return statSync(join(DUMPED_TEXTURES_DIR, n)).isDirectory(); } catch { return false; }
    });
    for (const ns of namespaces) {
      const nsDir = join(DUMPED_TEXTURES_DIR, ns);
      const files = walkDir(nsDir).filter(f => extname(f) === ".png");
      for (const file of files) {
        const relPath = file.replace(nsDir + "\\", "").replace(nsDir + "/", "");
        const outputPath = join(OUTPUT_DIR, "assets", ns, relPath);
        mkdirSync(join(outputPath, ".."), { recursive: true });
        copyFileSync(file, outputPath);
        dumpCount++;
      }
    }
    if (dumpCount > 0) console.log(`  dumped-textures → ${dumpCount} 個材質 (${namespaces.join(", ")})`);
    totalExtracted += dumpCount;
  } else {
    console.log("  (無傾印資料)");
  }

  // 5. Summary
  console.log(`\n=== 完成！共提取 ${totalExtracted} 個材質 ===`);

  const assetsDir = join(OUTPUT_DIR, "assets");
  if (existsSync(assetsDir)) {
    const namespaces = readdirSync(assetsDir)
      .filter((n) => statSync(join(assetsDir, n)).isDirectory())
      .sort();
    console.log(`命名空間 (${namespaces.length}):`);
    for (const ns of namespaces) {
      const itemDir = join(assetsDir, ns, "textures", "item");
      const itemsDir = join(assetsDir, ns, "textures", "items");
      const blockDir = join(assetsDir, ns, "textures", "block");
      let itemCount = 0, blockCount = 0;
      try { itemCount = readdirSync(itemDir, { recursive: true }).filter(f => extname(f) === ".png").length; } catch {}
      try { itemCount += readdirSync(itemsDir, { recursive: true }).filter(f => extname(f) === ".png").length; } catch {}
      try { blockCount = readdirSync(blockDir, { recursive: true }).filter(f => extname(f) === ".png").length; } catch {}
      if (itemCount > 0 || blockCount > 0) {
        console.log(`  ${ns}: ${itemCount} item, ${blockCount} block`);
      }
    }
  }
}

main();
