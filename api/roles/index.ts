import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyJwt, checkSuperAdmin, checkListingPermission, getDbClient, getRolesTable, getAuditLogTable, writeAuditLog } from "../listings/_helpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await verifyJwt(req);
  if (!user) return res.status(401).json({ error: "not_authenticated" });

  // Dispatch based on URL path
  const segments = (req.url || "").split("?")[0].split("/").filter(Boolean);
  const isAuditRoute = segments.includes("audit");

  if (isAuditRoute) {
    return handleAudit(req, res, user);
  }

  const isSuperAdmin = await checkSuperAdmin(user.discordId);
  if (!isSuperAdmin) return res.status(403).json({ error: "forbidden" });

  const db = getDbClient();
  const table = getRolesTable();

  if (req.method === "GET") {
    const result = await db.execute(`SELECT user_id, role, username, assigned_by, created_at FROM ${table} ORDER BY created_at DESC`);
    const rows = (result.rows ?? []).map((r) => ({
      userId: String(r[0] ?? r.user_id ?? ""),
      role: String(r[1] ?? r.role ?? ""),
      username: String(r[2] ?? r.username ?? ""),
      assignedBy: String(r[3] ?? r.assigned_by ?? ""),
      createdAt: String(r[4] ?? r.created_at ?? ""),
    }));
    return res.status(200).json(rows);
  }

  if (req.method === "POST") {
    const { userId, username } = req.body as { userId?: string; username?: string };
    if (!userId) return res.status(400).json({ error: "missing_userId" });
    await db.execute({
      sql: `INSERT OR REPLACE INTO ${table} (user_id, role, username, assigned_by) VALUES (?, 'warehouse_staff', ?, ?)`,
      args: [userId, username || "", user.discordId],
    });
    await writeAuditLog({
      actorId: user.discordId,
      actorName: user.username,
      action: "role_add",
      targetType: "role",
      targetId: userId,
      detail: `新增倉儲人員 ${username || userId}`,
    });
    return res.status(200).json({ success: true });
  }

  if (req.method === "DELETE") {
    const { userId } = req.body as { userId?: string };
    if (!userId) return res.status(400).json({ error: "missing_userId" });
    await db.execute({
      sql: `DELETE FROM ${table} WHERE user_id = ? AND role = 'warehouse_staff'`,
      args: [userId],
    });
    await writeAuditLog({
      actorId: user.discordId,
      actorName: user.username,
      action: "role_remove",
      targetType: "role",
      targetId: userId,
      detail: `移除倉儲人員 ${userId}`,
    });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "method_not_allowed" });
}

// ── Audit log handler (merged to save serverless function slots) ──
async function handleAudit(req: VercelRequest, res: VercelResponse, user: { discordId: string; username: string }) {
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const hasRole = await checkListingPermission(user.discordId);
  if (!hasRole) return res.status(403).json({ error: "insufficient_role" });

  const db = getDbClient();
  const table = getAuditLogTable();
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const offset = Number(req.query.offset) || 0;

  try {
    const result = await db.execute({
      sql: `SELECT id, actor_id, actor_name, action, target_type, target_id, detail, created_at FROM ${table} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      args: [limit, offset],
    });
    const rows = (result.rows ?? []).map((r) => ({
      id: Number(r.id ?? r[0]),
      actorId: String(r.actor_id ?? r[1] ?? ""),
      actorName: String(r.actor_name ?? r[2] ?? ""),
      action: String(r.action ?? r[3] ?? ""),
      targetType: String(r.target_type ?? r[4] ?? ""),
      targetId: String(r.target_id ?? r[5] ?? ""),
      detail: String(r.detail ?? r[6] ?? ""),
      createdAt: String(r.created_at ?? r[7] ?? ""),
    }));
    return res.status(200).json(rows);
  } catch (err) {
    console.error("Audit GET error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
