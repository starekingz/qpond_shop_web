/** One-time script to create shopmod_anomalies table in Turso */
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
  console.log("Creating shopmod_anomalies table...");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS shopmod_anomalies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      item_id TEXT NOT NULL,
      chest_x INTEGER NOT NULL,
      chest_y INTEGER NOT NULL,
      chest_z INTEGER NOT NULL,
      slot INTEGER NOT NULL,
      listing_count INTEGER NOT NULL,
      warehouse_count INTEGER NOT NULL DEFAULT 0,
      detected_by TEXT NOT NULL,
      detected_by_name TEXT NOT NULL,
      confirmed INTEGER NOT NULL DEFAULT 0,
      confirmed_by TEXT,
      confirmed_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log("Table created.");
  console.log("Done!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
