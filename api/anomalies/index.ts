import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyJwt, checkListingPermission, getDbClient, getAnomaliesTable } from "../listings/_helpers.js";

interface CreateAnomalyBody {
  listingId: number;
  itemName: string;
  itemId: string;
  chestX: number;
  chestY: number;
  chestZ: number;
  slot: number;
  listingCount: number;
  warehouseCount: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segments = (req.url || "").split("?")[0].split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  const idMatch = lastSegment && /^\d+$/.test(lastSegment) ? Number(lastSegment) : null;

  if (req.method === "PATCH" && idMatch) {
    return handlePatch(req, res, idMatch);
  }
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "POST") {
    return handlePost(req, res);
  }
  return res.status(405).json({ error: "method_not_allowed" });
}

// GET /api/anomalies  (admin only)
async function handleGet(req: VercelRequest, res: VercelResponse) {
  const user = await verifyJwt(req);
  if (!user) return res.status(401).json({ error: "not_authenticated" });

  const isAdmin = await checkListingPermission(user.discordId);
  if (!isAdmin) return res.status(403).json({ error: "insufficient_role" });

  const table = getAnomaliesTable();
  const db = getDbClient();

  try {
    const result = await db.execute({
      sql: `SELECT * FROM ${table} ORDER BY created_at DESC LIMIT 200`,
      args: [],
    });

    const rows = result.rows.map((row) => ({
      id: Number(row.id),
      listingId: Number(row.listing_id),
      itemName: String(row.item_name),
      itemId: String(row.item_id),
      chestX: Number(row.chest_x),
      chestY: Number(row.chest_y),
      chestZ: Number(row.chest_z),
      slot: Number(row.slot),
      listingCount: Number(row.listing_count),
      warehouseCount: Number(row.warehouse_count),
      detectedBy: String(row.detected_by),
      detectedByName: String(row.detected_by_name),
      confirmed: Number(row.confirmed ?? 0) === 1,
      confirmedBy: row.confirmed_by ? String(row.confirmed_by) : null,
      confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
      notes: row.notes ? String(row.notes) : null,
      createdAt: String(row.created_at),
    }));

    return res.status(200).json(rows);
  } catch (err) {
    console.error("Anomalies GET error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}

// POST /api/anomalies  (admin only — create anomaly records, deduplicates by listing_id)
async function handlePost(req: VercelRequest, res: VercelResponse) {
  const user = await verifyJwt(req);
  if (!user) return res.status(401).json({ error: "not_authenticated" });

  const isAdmin = await checkListingPermission(user.discordId);
  if (!isAdmin) return res.status(403).json({ error: "insufficient_role" });

  const body = req.body as { anomalies: CreateAnomalyBody[] };
  if (!body?.anomalies || !Array.isArray(body.anomalies) || body.anomalies.length === 0) {
    return res.status(400).json({ error: "missing_anomalies" });
  }

  const table = getAnomaliesTable();
  const db = getDbClient();
  let created = 0;
  let skipped = 0;

  try {
    for (const a of body.anomalies) {
      // Check if there's already an unconfirmed anomaly for this listing
      const existing = await db.execute({
        sql: `SELECT id FROM ${table} WHERE listing_id = ? AND confirmed = 0`,
        args: [a.listingId],
      });
      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }

      await db.execute({
        sql: `INSERT INTO ${table} (listing_id, item_name, item_id, chest_x, chest_y, chest_z, slot, listing_count, warehouse_count, detected_by, detected_by_name)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          a.listingId,
          a.itemName,
          a.itemId,
          a.chestX,
          a.chestY,
          a.chestZ,
          a.slot,
          a.listingCount,
          a.warehouseCount,
          user.discordId,
          user.username,
        ],
      });
      created++;
    }

    return res.status(201).json({ created, skipped });
  } catch (err) {
    console.error("Anomalies POST error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}

// PATCH /api/anomalies/:id  (admin only — confirm or add notes)
async function handlePatch(req: VercelRequest, res: VercelResponse, id: number) {
  const user = await verifyJwt(req);
  if (!user) return res.status(401).json({ error: "not_authenticated" });

  const isAdmin = await checkListingPermission(user.discordId);
  if (!isAdmin) return res.status(403).json({ error: "insufficient_role" });

  const { confirmed, notes } = req.body as { confirmed?: boolean; notes?: string };

  const table = getAnomaliesTable();
  const db = getDbClient();

  try {
    if (typeof confirmed === "boolean") {
      await db.execute({
        sql: `UPDATE ${table} SET confirmed = ?, confirmed_by = ?, confirmed_at = datetime('now') WHERE id = ?`,
        args: [confirmed ? 1 : 0, user.discordId, id],
      });
    }

    if (typeof notes === "string") {
      await db.execute({
        sql: `UPDATE ${table} SET notes = ? WHERE id = ?`,
        args: [notes, id],
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Anomalies PATCH error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
