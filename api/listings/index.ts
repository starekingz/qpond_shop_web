import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyJwt, checkListingPermission, getDbClient, getListingsTable, getCatalogTable, writeAuditLog, makeCatalogKey } from "./_helpers.js";

interface CreateListingBody {
  chestPos: { x: number; y: number; z: number };
  slot: number;
  itemName: string;
  itemId: string;
  itemComponents?: string;
  tooltipLines?: string[];
  count: number;
  price: number;
  listingType: "single" | "bulk";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Dispatch catalog requests (rewritten from /api/catalog)
  const pathSegments = (req.url || "").split("?")[0].split("/").filter(Boolean);
  if (pathSegments.includes("catalog")) {
    return handleCatalog(req, res);
  }

  // Extract optional :id from path: /api/listings/<id>
  const segments = (req.url || "").split("?")[0].split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  const idMatch = lastSegment && /^\d+$/.test(lastSegment) ? Number(lastSegment) : null;

  if (req.method === "DELETE" && idMatch) {
    return handleDelete(req, res, idMatch);
  }
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "POST") {
    return handlePost(req, res);
  }
  return res.status(405).json({ error: "method_not_allowed" });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { chest_x, chest_y, chest_z } = req.query;
  const table = getListingsTable();
  const db = getDbClient();

  try {
    let sql: string;
    let args: (string | number)[];

    if (chest_x !== undefined && chest_y !== undefined && chest_z !== undefined) {
      sql = `SELECT * FROM ${table} WHERE chest_x = ? AND chest_y = ? AND chest_z = ? AND status = 'active' ORDER BY slot ASC`;
      args = [Number(chest_x), Number(chest_y), Number(chest_z)];
    } else {
      sql = `SELECT * FROM ${table} WHERE status = 'active' ORDER BY created_at DESC LIMIT 200`;
      args = [];
    }

    const result = await db.execute({ sql, args });
    const rows = result.rows.map((row) => ({
      id: Number(row.id),
      sellerId: String(row.seller_id),
      sellerName: String(row.seller_name),
      chestX: Number(row.chest_x),
      chestY: Number(row.chest_y),
      chestZ: Number(row.chest_z),
      slot: Number(row.slot),
      itemName: String(row.item_name),
      itemId: String(row.item_id),
      itemComponents: String(row.item_components ?? ""),
      tooltipLines: (() => {
        try { return JSON.parse(String(row.tooltip_lines ?? "[]")); }
        catch { return []; }
      })(),
      count: Number(row.count),
      price: Number(row.price),
      listingType: String(row.listing_type),
      status: String(row.status),
      createdAt: String(row.created_at),
    }));

    return res.status(200).json(rows);
  } catch (err) {
    console.error("Listings GET error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  // Auth check
  const user = await verifyJwt(req);
  if (!user) {
    return res.status(401).json({ error: "not_authenticated" });
  }

  // Role check
  const hasRole = await checkListingPermission(user.discordId);
  if (!hasRole) {
    return res.status(403).json({ error: "insufficient_role" });
  }

  const body = req.body as CreateListingBody;
  if (!body || !body.chestPos || !body.itemName || !body.itemId || !body.count || !body.price || !body.listingType) {
    return res.status(400).json({ error: "missing_fields" });
  }

  const { chestPos, slot, itemName, itemId, itemComponents, tooltipLines, count, price, listingType } = body;

  if (listingType !== "single" && listingType !== "bulk") {
    return res.status(400).json({ error: "invalid_listing_type" });
  }
  if (price <= 0 || !isFinite(price)) {
    return res.status(400).json({ error: "invalid_price" });
  }

  const table = getListingsTable();
  const db = getDbClient();
  const actualSlot = listingType === "bulk" ? -1 : slot;

  try {
    // Check for conflicts
    if (listingType === "bulk") {
      // Bulk: no active single listings for this chest
      const existing = await db.execute({
        sql: `SELECT COUNT(*) as cnt FROM ${table} WHERE chest_x = ? AND chest_y = ? AND chest_z = ? AND status = 'active'`,
        args: [chestPos.x, chestPos.y, chestPos.z],
      });
      const cnt = Number(existing.rows[0]?.cnt ?? 0);
      if (cnt > 0) {
        return res.status(409).json({ error: "conflict", message: "此箱子已有上架物品，無法整箱上架" });
      }
    } else {
      // Single: no active bulk listing for this chest
      const bulkCheck = await db.execute({
        sql: `SELECT COUNT(*) as cnt FROM ${table} WHERE chest_x = ? AND chest_y = ? AND chest_z = ? AND slot = -1 AND status = 'active'`,
        args: [chestPos.x, chestPos.y, chestPos.z],
      });
      const cnt = Number(bulkCheck.rows[0]?.cnt ?? 0);
      if (cnt > 0) {
        return res.status(409).json({ error: "conflict", message: "此箱子已整箱上架，無法單個上架" });
      }
    }

    const result = await db.execute({
      sql: `INSERT INTO ${table} (seller_id, seller_name, chest_x, chest_y, chest_z, slot, item_name, item_id, item_components, tooltip_lines, count, price, listing_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        user.discordId,
        user.username,
        chestPos.x,
        chestPos.y,
        chestPos.z,
        actualSlot,
        itemName,
        itemId,
        itemComponents ?? "",
        JSON.stringify(tooltipLines ?? []),
        count,
        price,
        listingType,
      ],
    });

    await writeAuditLog({
      actorId: user.discordId,
      actorName: user.username,
      action: "listing_create",
      targetType: "listing",
      targetId: String(result.lastInsertRowid),
      detail: `${listingType === "bulk" ? "整箱" : "單個"}上架 ${itemName} x${count} @ $${price}`,
    });

    return res.status(201).json({
      id: Number(result.lastInsertRowid),
      sellerId: user.discordId,
      sellerName: user.username,
      chestX: chestPos.x,
      chestY: chestPos.y,
      chestZ: chestPos.z,
      slot: actualSlot,
      itemName,
      itemId,
      itemComponents: itemComponents ?? "",
      tooltipLines: tooltipLines ?? [],
      count,
      price,
      listingType,
      status: "active",
      createdAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE constraint")) {
      return res.status(409).json({ error: "conflict", message: "此 slot 已有上架物品" });
    }
    console.error("Listings POST error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}

async function handleDelete(req: VercelRequest, res: VercelResponse, id: number) {
  const user = await verifyJwt(req);
  if (!user) {
    return res.status(401).json({ error: "not_authenticated" });
  }

  const hasRole = await checkListingPermission(user.discordId);
  if (!hasRole) {
    return res.status(403).json({ error: "insufficient_role" });
  }

  const table = getListingsTable();
  const db = getDbClient();

  try {
    // Check listing exists and is active
    const existing = await db.execute({
      sql: `SELECT id FROM ${table} WHERE id = ? AND status = 'active'`,
      args: [id],
    });

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "not_found" });
    }

    await db.execute({
      sql: `UPDATE ${table} SET status = 'cancelled' WHERE id = ?`,
      args: [id],
    });

    await writeAuditLog({
      actorId: user.discordId,
      actorName: user.username,
      action: "listing_cancel",
      targetType: "listing",
      targetId: String(id),
      detail: `下架商品 #${id}`,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Listings DELETE error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}

// ── Catalog API (rewritten from /api/catalog) ──

interface CatalogSyncItem {
  itemId: string;
  itemName: string;
  itemComponents?: string;
}

async function handleCatalog(req: VercelRequest, res: VercelResponse) {
  const catalogTable = getCatalogTable();
  const db = getDbClient();

  if (req.method === "GET") {
    // Public: return all catalog items
    try {
      const result = await db.execute({
        sql: `SELECT * FROM ${catalogTable} ORDER BY item_name ASC`,
        args: [],
      });
      const rows = result.rows.map((row) => ({
        catalogKey: String(row.catalog_key),
        itemId: String(row.item_id),
        itemName: String(row.item_name),
        itemComponents: String(row.item_components ?? ""),
        firstSeen: String(row.first_seen),
        lastSeen: String(row.last_seen),
      }));
      return res.status(200).json(rows);
    } catch (err) {
      console.error("Catalog GET error:", err);
      return res.status(500).json({ error: "internal_error" });
    }
  }

  if (req.method === "POST") {
    // Sync: upsert bulk items from warehouse into catalog
    const body = req.body as { items?: CatalogSyncItem[] };
    if (!body?.items || !Array.isArray(body.items)) {
      return res.status(400).json({ error: "missing_items" });
    }

    try {
      for (const item of body.items) {
        if (!item.itemId || !item.itemName) continue;
        const catalogKey = makeCatalogKey(item.itemId, item.itemComponents ?? "");
        await db.execute({
          sql: `INSERT INTO ${catalogTable} (catalog_key, item_id, item_name, item_components) VALUES (?, ?, ?, ?)
                ON CONFLICT(catalog_key) DO UPDATE SET item_name = excluded.item_name, item_components = excluded.item_components, last_seen = datetime('now')`,
          args: [catalogKey, item.itemId, item.itemName, item.itemComponents ?? ""],
        });
      }
      return res.status(200).json({ success: true, synced: body.items.length });
    } catch (err) {
      console.error("Catalog sync error:", err);
      return res.status(500).json({ error: "internal_error" });
    }
  }

  return res.status(405).json({ error: "method_not_allowed" });
}
