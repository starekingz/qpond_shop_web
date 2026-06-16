import { createClient } from "@libsql/client/web";
import { createHash } from "crypto";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.VITE_TURSO_DATABASE_URL;
const token = process.env.VITE_TURSO_AUTH_TOKEN;
const table = process.env.VITE_TURSO_CATALOG_TABLE || "shopmod_item_catalog";

if (!url || !token) {
  console.error("Missing VITE_TURSO_DATABASE_URL or VITE_TURSO_AUTH_TOKEN");
  process.exit(1);
}

const db = createClient({ url, authToken: token });

function makeKey(itemId, itemComponents) {
  const raw = itemId + "|" + (itemComponents || "");
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

async function migrate() {
  console.log("Current schema:");
  try {
    const info = await db.execute(`PRAGMA table_info(${table})`);
    console.log(info.rows.map(r => `${r.name} (${r.type}) pk=${r.pk}`).join("\n"));
  } catch (e) {
    console.log("Table might not exist:", e.message);
  }

  // Step 1: Create new table with catalog_key as PK
  const newTable = `${table}_v2`;
  console.log(`\nCreating ${newTable}...`);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${newTable} (
      catalog_key TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      item_components TEXT DEFAULT '',
      first_seen TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now'))
    )
  `);

  // Step 2: Copy data from old table
  console.log("Copying data from old table...");
  const oldData = await db.execute(`SELECT * FROM ${table}`);
  console.log(`Found ${oldData.rows.length} rows in old table`);
  
  for (const row of oldData.rows) {
    const itemId = String(row.item_id);
    const itemComponents = String(row.item_components ?? "");
    const key = makeKey(itemId, itemComponents);
    await db.execute({
      sql: `INSERT OR IGNORE INTO ${newTable} (catalog_key, item_id, item_name, item_components, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [key, itemId, String(row.item_name), itemComponents, String(row.first_seen), String(row.last_seen)],
    });
    console.log(`  Migrated: ${String(row.item_name)} (${itemId}) -> key=${key.slice(0, 8)}...`);
  }

  // Step 3: Drop old table and rename
  console.log("\nDropping old table...");
  await db.execute(`DROP TABLE IF EXISTS ${table}`);
  console.log(`Renaming ${newTable} -> ${table}...`);
  await db.execute(`ALTER TABLE ${newTable} RENAME TO ${table}`);

  // Verify
  const verify = await db.execute(`SELECT * FROM ${table}`);
  console.log(`\nMigration complete! ${verify.rows.length} rows in new table`);
  for (const row of verify.rows) {
    console.log(`  ${String(row.item_name)} | ${String(row.item_id)} | key=${String(row.catalog_key).slice(0, 8)}...`);
  }
}

migrate().catch(e => { console.error("Migration failed:", e); process.exit(1); });
