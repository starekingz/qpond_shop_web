/** One-time script to add inspection_result column to shopmod_orders in Turso */
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
  console.log("Adding inspection_result column...");
  await client.execute(`
    ALTER TABLE shopmod_orders ADD COLUMN inspection_result TEXT
  `);
  console.log("Column added.");
  console.log("Done!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
