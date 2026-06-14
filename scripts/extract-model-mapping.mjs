/**
 * 從伺服器資源包中提取 custom_model_data → texture 映射
 *
 * 輸出：public/model-mapping.json
 * 格式：{ "minecraft:diamond_sword": { "1": "minecraft:item/swords/custom1", ... } }
 *
 * 用法：node scripts/extract-model-mapping.mjs
 */

import AdmZip from "adm-zip";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from "fs";
import { join, extname } from "path";
import { homedir } from "os";

const MC_DIR = join(homedir(), "AppData", "Roaming", ".minecraft");
const PACKS_DIR = join(MC_DIR, "server-resource-packs");
const OUTPUT_FILE = join(process.cwd(), "public", "model-mapping.json");

// ── helpers ──

function findMainPack() {
  if (!existsSync(PACKS_DIR)) return null;
  const packs = readdirSync(PACKS_DIR)
    .filter((n) => statSync(join(PACKS_DIR, n)).isFile())
    .map((n) => ({ name: n, path: join(PACKS_DIR, n), size: statSync(join(PACKS_DIR, n)).size }))
    .sort((a, b) => b.size - a.size); // largest first
  return packs[0] || null;
}

function loadZipEntries(packPath) {
  try {
    const zip = new AdmZip(packPath);
    return zip.getEntries();
  } catch {
    return [];
  }
}

function readEntrySafe(entry) {
  try {
    return entry.getData().toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Resolve a model reference like "swords/dragon_sword" or "end_ships:ia_auto_gen/celestial_boots"
 * to its JSON content from the zip entries map.
 */
function resolveModel(modelRef, entriesMap) {
  // Parse namespace:path
  let namespace, path;
  if (modelRef.includes(":")) {
    [namespace, path] = modelRef.split(":");
  } else {
    namespace = "minecraft";
    path = modelRef;
  }

  // Try models/item/<path>.json first, then models/<path>.json
  const candidates = [
    `assets/${namespace}/models/item/${path}.json`,
    `assets/${namespace}/models/${path}.json`,
  ];

  for (const key of candidates) {
    if (entriesMap.has(key)) {
      return entriesMap.get(key);
    }
  }
  return null;
}

/**
 * Extract the primary texture from a model JSON.
 * Handles "layer0", "0", and parent chain.
 */
function extractTexturePath(modelJson, entriesMap, depth = 0) {
  if (depth > 5 || !modelJson) return null;

  // Check textures directly
  const tex = modelJson.textures;
  if (tex) {
    // layer0 is the standard for flat items, "0" for generated
    const layer0 = tex.layer0 || tex["0"] || tex.particle;
    if (layer0 && typeof layer0 === "string" && !layer0.startsWith("#")) {
      // Resolve texture reference
      return layer0;
    }
  }

  // Check parent chain
  if (modelJson.parent) {
    const parentRef = modelJson.parent;
    if (parentRef === "item/generated" || parentRef === "item/handheld" || parentRef === "builtin/entity") {
      return null; // vanilla base, no custom texture
    }
    const parentModel = resolveModel(parentRef, entriesMap);
    if (parentModel) {
      return extractTexturePath(parentModel, entriesMap, depth + 1);
    }
  }

  return null;
}

/**
 * Convert a texture reference like "minecraft:item/swords/dragon_sword"
 * to a file path: "minecraft/textures/item/swords/dragon_sword.png"
 */
function textureRefToFilePath(texRef) {
  let namespace, path;
  if (texRef.includes(":")) {
    [namespace, path] = texRef.split(":");
  } else {
    namespace = "minecraft";
    path = texRef;
  }
  return `${namespace}:${path}`;
}

// ── main ──

function main() {
  console.log("=== Custom Model Data → Texture Mapping ===\n");

  const pack = findMainPack();
  if (!pack) {
    console.error("找不到伺服器資源包");
    process.exit(1);
  }
  console.log(`使用資源包: ${pack.name} (${(pack.size / 1024 / 1024).toFixed(1)} MB)\n`);

  const entries = loadZipEntries(pack.path);
  if (entries.length === 0) {
    console.error("無法讀取資源包");
    process.exit(1);
  }

  // Build a map of all JSON entries (skip __MACOSX)
  const entriesMap = new Map();
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (entry.entryName.includes("__MACOSX")) continue;
    if (!entry.entryName.endsWith(".json")) continue;

    const content = readEntrySafe(entry);
    if (!content) continue;
    try {
      entriesMap.set(entry.entryName, JSON.parse(content));
    } catch {
      // skip malformed JSON
    }
  }
  console.log(`載入 ${entriesMap.size} 個 JSON 檔案\n`);

  // Find base item models with overrides
  const mapping = {}; // { "minecraft:item_id": { "cmd": "texturePath" } }
  let overrideCount = 0;

  for (const [key, modelJson] of entriesMap) {
    // Match: assets/minecraft/models/item/<item>.json
    const match = key.match(/^assets\/([^/]+)\/models\/item\/([^/]+)\.json$/);
    if (!match) continue;

    const namespace = match[1];
    const itemId = match[2];
    const fullItemId = `${namespace}:${itemId}`;

    if (!modelJson.overrides || !Array.isArray(modelJson.overrides)) continue;

    const cmdOverrides = {};

    for (const override of modelJson.overrides) {
      if (!override.predicate || override.predicate.custom_model_data == null) continue;

      const cmd = override.predicate.custom_model_data;

      // Skip overrides with extra predicates (pulling, pull, damage, etc.)
      // We only want the "resting" state (no pulling/pull)
      const extraKeys = Object.keys(override.predicate).filter(
        (k) => k !== "custom_model_data"
      );
      if (extraKeys.length > 0) continue;

      // Resolve the target model
      const targetModelRef = override.model;
      const targetModel = resolveModel(targetModelRef, entriesMap);

      let texturePath = null;
      if (targetModel) {
        texturePath = extractTexturePath(targetModel, entriesMap);
      }

      // If model resolution or texture extraction failed, try to infer texture from model path
      if (!texturePath) {
        // Infer: model "swords/dragon_sword" → texture "minecraft:item/swords/dragon_sword"
        let ns, mp;
        if (targetModelRef.includes(":")) {
          [ns, mp] = targetModelRef.split(":");
        } else {
          ns = namespace;
          mp = targetModelRef;
        }
        texturePath = `${ns}:item/${mp}`;
      }

      cmdOverrides[String(cmd)] = textureRefToFilePath(texturePath);
      overrideCount++;
    }

    if (Object.keys(cmdOverrides).length > 0) {
      mapping[fullItemId] = cmdOverrides;
    }
  }

  // Sort keys for readability
  const sorted = {};
  for (const k of Object.keys(mapping).sort()) {
    sorted[k] = mapping[k];
  }

  // Write output
  mkdirSync(join(OUTPUT_FILE, ".."), { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(sorted, null, 2), "utf8");

  console.log(`映射結果:`);
  for (const [itemId, cmds] of Object.entries(sorted)) {
    const cmdList = Object.entries(cmds);
    console.log(`  ${itemId}: ${cmdList.length} 個自訂材質`);
    for (const [cmd, tex] of cmdList.slice(0, 3)) {
      console.log(`    CMD ${cmd} → ${tex}`);
    }
    if (cmdList.length > 3) {
      console.log(`    ... 及其他 ${cmdList.length - 3} 個`);
    }
  }

  console.log(`\n總計: ${Object.keys(sorted).length} 個基礎物品, ${overrideCount} 個映射`);
  console.log(`輸出: ${OUTPUT_FILE}`);
}

main();
