/** One-time script to create shopmod_listings table in Turso */
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
  console.log("Creating shopmod_listings table...");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS shopmod_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id TEXT NOT NULL,
      seller_name TEXT NOT NULL,
      chest_x INTEGER NOT NULL,
      chest_y INTEGER NOT NULL,
      chest_z INTEGER NOT NULL,
      slot INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_components TEXT DEFAULT '',
      tooltip_lines TEXT DEFAULT '[]',
      count INTEGER NOT NULL,
      price REAL NOT NULL,
      listing_type TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log("Table created.");

  console.log("Creating unique index...");
  await client.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_pos_slot
      ON shopmod_listings(chest_x, chest_y, chest_z, slot)
      WHERE status = 'active'
  `);
  console.log("Index created.");

  console.log("Done!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
