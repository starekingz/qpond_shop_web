import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyJwt, checkListingPermission, getDbClient, getPresenceTable } from "../listings/_helpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "POST") return handlePost(req, res);
  if (req.method === "GET") return handleGet(req, res);
  return res.status(405).json({ error: "method_not_allowed" });
}

// POST /api/presence — admin heartbeat (every 30s)
async function handlePost(req: VercelRequest, res: VercelResponse) {
  const user = await verifyJwt(req);
  if (!user) return res.status(401).json({ error: "not_authenticated" });

  const isAdmin = await checkListingPermission(user.discordId);
  if (!isAdmin) return res.status(403).json({ error: "not_admin" });

  const table = getPresenceTable();
  const db = getDbClient();

  try {
    await db.execute({
      sql: `INSERT INTO ${table} (user_id, username, last_seen)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET last_seen = datetime('now'), username = excluded.username`,
      args: [user.discordId, user.username],
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Presence POST error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}

// GET /api/presence — returns online admins (last_seen within 90s)
async function handleGet(req: VercelRequest, res: VercelResponse) {
  const table = getPresenceTable();
  const db = getDbClient();

  try {
    // Clean up stale records (> 2 minutes)
    await db.execute({
      sql: `DELETE FROM ${table} WHERE last_seen < datetime('now', '-2 minutes')`,
      args: [],
    });

    // Fetch online admins (last_seen within 90 seconds)
    const result = await db.execute({
      sql: `SELECT user_id, username, last_seen FROM ${table}
            WHERE last_seen >= datetime('now', '-90 seconds')
            ORDER BY last_seen DESC`,
      args: [],
    });

    const admins = result.rows.map((row) => ({
      userId: String(row.user_id),
      username: String(row.username),
      lastSeen: String(row.last_seen),
    }));

    return res.status(200).json(admins);
  } catch (err) {
    console.error("Presence GET error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
