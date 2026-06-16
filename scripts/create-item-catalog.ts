/** One-time script to create shopmod_item_catalog table + add queued_at to orders */
import { createClient } from "@libsql/client";
import "dotenv/config";

const url = process.env.TURSO_DATABASE_URL || process.env.VITE_TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN || process.env.VITE_TURSO_AUTH_TOKEN;

if (!url || !token) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
  process.exit(1);
}

const client = createClient({ url, authToken: token });

async function main() {
  console.log("Creating shopmod_item_catalog table...");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS shopmod_item_catalog (
      item_id TEXT PRIMARY KEY,
      item_name TEXT NOT NULL,
      item_components TEXT DEFAULT '',
      first_seen TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log("shopmod_item_catalog created.");

  console.log("Adding queued_at column to shopmod_orders...");
  try {
    await client.execute(`ALTER TABLE shopmod_orders ADD COLUMN queued_at TEXT`);
    console.log("queued_at column added.");
  } catch (e: unknown) {
    console.log("Column may already exist:", e instanceof Error ? e.message : String(e));
  }

  console.log("Done!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
