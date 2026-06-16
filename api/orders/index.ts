import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyJwt, checkListingPermission, getDbClient, getOrdersTable, getMessagesTable, getListingsTable } from "../listings/_helpers.js";

interface OrderItem {
  listingId: number;
  itemName: string;
  itemId: string;
  count: number;
  price: number;
  listingType?: "single" | "bulk";
  itemComponents?: string;
  chestX?: number;
  chestY?: number;
  chestZ?: number;
  slot?: number;
  listingCount?: number;
}

interface CreateOrderBody {
  items: OrderItem[];
  assignedAdminId?: string;
  minecraftId: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Extract optional :id from path: /api/orders/<id>
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

// GET /api/orders?status=pending  (admin: all orders; ?mine=true: buyer's own orders)
async function handleGet(req: VercelRequest, res: VercelResponse) {
  const user = await verifyJwt(req);
  if (!user) return res.status(401).json({ error: "not_authenticated" });

  const isAdmin = await checkListingPermission(user.discordId);
  const mine = req.query.mine === "true";

  // Non-admin can only query their own orders
  if (!isAdmin && !mine) return res.status(403).json({ error: "insufficient_role" });

  const table = getOrdersTable();
  const db = getDbClient();
  const status = req.query.status as string | undefined;

  try {
    let sql: string;
    let args: string[];

    if (mine && !isAdmin) {
      // Buyer: own orders (all statuses, for history view)
      sql = `SELECT * FROM ${table} WHERE buyer_id = ? ORDER BY created_at DESC LIMIT 200`;
      args = [user.discordId];
    } else if (status) {
      sql = `SELECT * FROM ${table} WHERE status = ? ORDER BY created_at DESC LIMIT 200`;
      args = [status];
    } else {
      sql = `SELECT * FROM ${table} ORDER BY created_at DESC LIMIT 200`;
      args = [];
    }

    const result = await db.execute({ sql, args });
    const rows = result.rows.map((row) => ({
      id: Number(row.id),
      buyerId: String(row.buyer_id),
      buyerName: String(row.buyer_name),
      items: (() => { try { return JSON.parse(String(row.items)); } catch { return []; } })(),
      totalPrice: Number(row.total_price),
      status: String(row.status),
      assignedAdminId: row.assigned_admin_id ? String(row.assigned_admin_id) : null,
      minecraftId: row.minecraft_id ? String(row.minecraft_id) : null,
      inspected: Number(row.inspected ?? 0) === 1,
      inspectionResult: row.inspection_result ? (() => { try { return JSON.parse(String(row.inspection_result)); } catch { return null; } })() : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));

    return res.status(200).json(rows);
  } catch (err) {
    console.error("Orders GET error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}

// POST /api/orders  (any logged-in user)
async function handlePost(req: VercelRequest, res: VercelResponse) {
  const user = await verifyJwt(req);
  if (!user) return res.status(401).json({ error: "not_authenticated" });

  const body = req.body as CreateOrderBody;
  if (!body?.items || !Array.isArray(body.items) || body.items.length === 0) {
    return res.status(400).json({ error: "missing_items" });
  }

  // Validate each item
  for (const item of body.items) {
    if (!item.listingId || !item.itemName || !item.itemId || !item.count || !item.price) {
      return res.status(400).json({ error: "invalid_item" });
    }
  }

  if (!body.minecraftId || typeof body.minecraftId !== "string" || body.minecraftId.trim().length === 0) {
    return res.status(400).json({ error: "missing_minecraft_id" });
  }

  const totalPrice = body.items.reduce((sum, i) => sum + i.price * i.count, 0);

  const table = getOrdersTable();
  const db = getDbClient();

  try {
    const assignedAdminId = body.assignedAdminId || null;
    const initialStatus = assignedAdminId ? "processing" : "pending";
    const result = await db.execute({
      sql: `INSERT INTO ${table} (buyer_id, buyer_name, items, total_price, assigned_admin_id, minecraft_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        user.discordId,
        user.username,
        JSON.stringify(body.items),
        totalPrice,
        assignedAdminId,
        body.minecraftId.trim(),
        initialStatus,
      ],
    });

    const orderId = Number(result.lastInsertRowid);

    // Auto-send shopping list summary as a system message
    try {
      const msgTable = getMessagesTable();
      const lines = body.items.map((i) => `• ${i.itemName} x${i.count} — ${(i.price * i.count).toLocaleString()} $`);
      const summary = [
        `📋 訂單 #${orderId} 購物清單`,
        `買家: ${user.username}`,
        `MC ID: ${body.minecraftId.trim()}`,
        ``,
        ...lines,
        ``,
        `總計: ${totalPrice.toLocaleString()} $`,
      ].join("\n");

      await db.execute({
        sql: `INSERT INTO ${msgTable} (order_id, sender_id, sender_name, content) VALUES (?, ?, ?, ?)`,
        args: [orderId, "system", "系統", summary],
      });
    } catch (msgErr) {
      console.error("Failed to insert order summary message:", msgErr);
      // Non-fatal: order still succeeds even if summary message fails
    }

    return res.status(201).json({
      id: orderId,
      buyerId: user.discordId,
      buyerName: user.username,
      items: body.items,
      totalPrice,
      status: initialStatus,
      assignedAdminId,
      minecraftId: body.minecraftId.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Orders POST error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}

// PATCH /api/orders/:id  (admin only — update status)
async function handlePatch(req: VercelRequest, res: VercelResponse, id: number) {
  const user = await verifyJwt(req);
  if (!user) return res.status(401).json({ error: "not_authenticated" });

  const isAdmin = await checkListingPermission(user.discordId);
  if (!isAdmin) return res.status(403).json({ error: "insufficient_role" });

  const { status, inspected } = req.body as { status?: string; inspected?: boolean };

  const table = getOrdersTable();
  const db = getDbClient();

  // Support updating inspected flag
  if (typeof inspected === "boolean") {
    const { inspectionResult } = req.body as { inspectionResult?: unknown[] };
    try {
      const resultJson = inspectionResult ? JSON.stringify(inspectionResult) : null;
      await db.execute({
        sql: `UPDATE ${table} SET inspected = ?, inspection_result = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [inspected ? 1 : 0, resultJson, id],
      });
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error("Orders PATCH inspected error:", err);
      return res.status(500).json({ error: "internal_error" });
    }
  }

  const validStatuses = ["processing", "completed", "cancelled"];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: "invalid_status", valid: validStatuses });
  }

  try {
    const existing = await db.execute({
      sql: `SELECT id, items FROM ${table} WHERE id = ?`,
      args: [id],
    });
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "not_found" });
    }

    await db.execute({
      sql: `UPDATE ${table} SET status = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [status, id],
    });

    // Auto-cancel listings when order is marked as completed
    if (status === "completed") {
      try {
        const items: OrderItem[] = (() => { try { return JSON.parse(String(existing.rows[0].items)); } catch { return []; } })();
        const listingsTable = getListingsTable();
        for (const item of items) {
          await db.execute({
            sql: `UPDATE ${listingsTable} SET status = 'cancelled' WHERE id = ? AND status = 'active'`,
            args: [item.listingId],
          });
        }
      } catch (cancelErr) {
        console.error("Failed to cancel listings on order completion:", cancelErr);
        // Non-fatal: status update still succeeds
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Orders PATCH error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
