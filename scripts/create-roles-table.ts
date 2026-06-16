/** One-time script to create shopmod_roles table for warehouse staff management */
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
  console.log("Creating shopmod_roles table...");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS shopmod_roles (
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'warehouse_staff',
      username TEXT NOT NULL DEFAULT '',
      assigned_by TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, role)
    )
  `);
  console.log("shopmod_roles created.");
  console.log("Done!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
