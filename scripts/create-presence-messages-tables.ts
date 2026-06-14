/** One-time script to create presence and messages tables + add assigned_admin_id to orders */
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
  console.log("Creating shopmod_presence table...");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS shopmod_presence (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      last_seen TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log("shopmod_presence created.");

  console.log("Creating shopmod_messages table...");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS shopmod_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log("shopmod_messages created.");

  console.log("Adding assigned_admin_id column to shopmod_orders...");
  try {
    await client.execute(`ALTER TABLE shopmod_orders ADD COLUMN assigned_admin_id TEXT`);
    console.log("Column added.");
  } catch (e: unknown) {
    // Column might already exist
    console.log("Column may already exist:", e instanceof Error ? e.message : String(e));
  }

  console.log("Done!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
