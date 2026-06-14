import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyJwt, checkListingPermission, getDbClient, getOrdersTable } from "../listings/_helpers.js";

interface OrderItem {
  listingId: number;
  itemName: string;
  itemId: string;
  count: number;
  price: number;
}

interface CreateOrderBody {
  items: OrderItem[];
  assignedAdminId?: string;
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
      // Buyer: only own orders, exclude completed/cancelled
      sql = `SELECT * FROM ${table} WHERE buyer_id = ? AND status NOT IN ('completed', 'cancelled') ORDER BY created_at DESC LIMIT 200`;
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

  const totalPrice = body.items.reduce((sum, i) => sum + i.price * i.count, 0);

  const table = getOrdersTable();
  const db = getDbClient();

  try {
    const assignedAdminId = body.assignedAdminId || null;
    const result = await db.execute({
      sql: `INSERT INTO ${table} (buyer_id, buyer_name, items, total_price, assigned_admin_id) VALUES (?, ?, ?, ?, ?)`,
      args: [
        user.discordId,
        user.username,
        JSON.stringify(body.items),
        totalPrice,
        assignedAdminId,
      ],
    });

    return res.status(201).json({
      id: Number(result.lastInsertRowid),
      buyerId: user.discordId,
      buyerName: user.username,
      items: body.items,
      totalPrice,
      status: "pending",
      assignedAdminId,
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

  const { status } = req.body as { status?: string };
  const validStatuses = ["processing", "completed", "cancelled"];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: "invalid_status", valid: validStatuses });
  }

  const table = getOrdersTable();
  const db = getDbClient();

  try {
    const existing = await db.execute({
      sql: `SELECT id FROM ${table} WHERE id = ?`,
      args: [id],
    });
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "not_found" });
    }

    await db.execute({
      sql: `UPDATE ${table} SET status = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [status, id],
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Orders PATCH error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
