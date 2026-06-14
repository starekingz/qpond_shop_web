import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyJwt, checkListingPermission, getDbClient, getMessagesTable, getOrdersTable } from "../listings/_helpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  if (req.method === "DELETE") return handleDelete(req, res);
  return res.status(405).json({ error: "method_not_allowed" });
}

// GET /api/messages?orderId=N — fetch messages for an order
async function handleGet(req: VercelRequest, res: VercelResponse) {
  const user = await verifyJwt(req);
  if (!user) return res.status(401).json({ error: "not_authenticated" });

  const orderId = Number(req.query.orderId);
  if (!orderId) return res.status(400).json({ error: "missing_orderId" });

  const isAdmin = await checkListingPermission(user.discordId);
  const ordersTable = getOrdersTable();
  const db = getDbClient();

  try {
    // Verify order exists and user has access
    const orderResult = await db.execute({
      sql: `SELECT buyer_id, assigned_admin_id FROM ${ordersTable} WHERE id = ?`,
      args: [orderId],
    });
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: "order_not_found" });
    }

    const order = orderResult.rows[0];
    const isBuyer = String(order.buyer_id) === user.discordId;
    const isAssignedAdmin = String(order.assigned_admin_id || "") === user.discordId;

    // Buyer can only see own orders; admin can see all
    if (!isAdmin && !isBuyer) {
      return res.status(403).json({ error: "forbidden" });
    }

    // For non-assigned admins who are just browsing, still allow if isAdmin
    // (they might need to view chat when taking over)
    if (!isAdmin && !isBuyer && !isAssignedAdmin) {
      return res.status(403).json({ error: "forbidden" });
    }

    const table = getMessagesTable();
    const result = await db.execute({
      sql: `SELECT id, sender_id, sender_name, content, created_at FROM ${table}
            WHERE order_id = ? ORDER BY created_at ASC, id ASC LIMIT 500`,
      args: [orderId],
    });

    const messages = result.rows.map((row) => ({
      id: Number(row.id),
      senderId: String(row.sender_id),
      senderName: String(row.sender_name),
      content: String(row.content),
      createdAt: String(row.created_at),
    }));

    return res.status(200).json(messages);
  } catch (err) {
    console.error("Messages GET error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}

// POST /api/messages — send a message to an order chat
async function handlePost(req: VercelRequest, res: VercelResponse) {
  const user = await verifyJwt(req);
  if (!user) return res.status(401).json({ error: "not_authenticated" });

  const { orderId, content } = req.body as { orderId?: number; content?: string };
  if (!orderId || !content || !content.trim()) {
    return res.status(400).json({ error: "missing_fields" });
  }

  const isAdmin = await checkListingPermission(user.discordId);
  const ordersTable = getOrdersTable();
  const db = getDbClient();

  try {
    // Verify order exists
    const orderResult = await db.execute({
      sql: `SELECT buyer_id, status FROM ${ordersTable} WHERE id = ?`,
      args: [orderId],
    });
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: "order_not_found" });
    }

    const order = orderResult.rows[0];
    const isBuyer = String(order.buyer_id) === user.discordId;

    // Buyer can only message own orders; admin can message any
    if (!isAdmin && !isBuyer) {
      return res.status(403).json({ error: "forbidden" });
    }

    // Don't allow messaging on completed/cancelled orders
    if (order.status === "completed" || order.status === "cancelled") {
      return res.status(400).json({ error: "order_closed" });
    }

    const table = getMessagesTable();
    const result = await db.execute({
      sql: `INSERT INTO ${table} (order_id, sender_id, sender_name, content) VALUES (?, ?, ?, ?)`,
      args: [orderId, user.discordId, user.username, content.trim()],
    });

    return res.status(201).json({
      id: Number(result.lastInsertRowid),
      senderId: user.discordId,
      senderName: user.username,
      content: content.trim(),
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Messages POST error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}

// DELETE /api/messages?orderId=N — delete all messages for an order (admin only)
async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const user = await verifyJwt(req);
  if (!user) return res.status(401).json({ error: "not_authenticated" });

  const isAdmin = await checkListingPermission(user.discordId);
  if (!isAdmin) return res.status(403).json({ error: "not_admin" });

  const orderId = Number(req.query.orderId);
  if (!orderId) return res.status(400).json({ error: "missing_orderId" });

  const table = getMessagesTable();
  const db = getDbClient();

  try {
    await db.execute({
      sql: `DELETE FROM ${table} WHERE order_id = ?`,
      args: [orderId],
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Messages DELETE error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
