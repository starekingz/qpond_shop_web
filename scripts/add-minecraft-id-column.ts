/** One-time script to add minecraft_id column to shopmod_orders */
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
  console.log("Adding minecraft_id column to shopmod_orders...");
  try {
    await client.execute(`ALTER TABLE shopmod_orders ADD COLUMN minecraft_id TEXT`);
    console.log("Column added.");
  } catch (e: unknown) {
    console.log("Column may already exist:", e instanceof Error ? e.message : String(e));
  }
  console.log("Done!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
