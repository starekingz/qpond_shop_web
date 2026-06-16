import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyJwt, checkSuperAdmin, getDbClient } from "../listings/_helpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const user = await verifyJwt(req);
  if (!user) return res.status(401).json({ error: "not_authenticated" });

  const isAdmin = await checkSuperAdmin(user.discordId);
  if (!isAdmin) return res.status(403).json({ error: "super_admin_only" });

  const { x, y, z } = req.body as { x?: number; y?: number; z?: number };
  if (x == null || y == null || z == null) {
    return res.status(400).json({ error: "missing_position" });
  }

  const table = process.env.VITE_TURSO_WAREHOUSE_TABLE || "shopmod_warehouse_chests";
  const db = getDbClient();

  try {
    // Read current warehouse JSON
    const result = await db.execute({
      sql: `SELECT json_payload FROM ${table} WHERE id = 1`,
      args: [],
    });
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "not_found" });
    }

    const raw = String(result.rows[0].json_payload ?? "");
    if (!raw) return res.status(404).json({ error: "not_found" });

    const parsed = JSON.parse(raw) as { chests?: Array<{ pos: { x: number; y: number; z: number } }> };
    if (!parsed.chests) return res.status(404).json({ error: "not_found" });

    const before = parsed.chests.length;
    parsed.chests = parsed.chests.filter(
      (c) => !(c.pos.x === x && c.pos.y === y && c.pos.z === z)
    );
    const after = parsed.chests.length;

    if (before === after) {
      return res.status(404).json({ error: "chest_not_found" });
    }

    // Write back
    await db.execute({
      sql: `UPDATE ${table} SET json_payload = ?, uploaded_at = datetime('now') WHERE id = 1`,
      args: [JSON.stringify(parsed)],
    });

    return res.status(200).json({ success: true, removed: 1 });
  } catch (err) {
    console.error("Warehouse DELETE error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
