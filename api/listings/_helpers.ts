import type { VercelRequest } from "@vercel/node";
import { createClient } from "@libsql/client/web";
import { jwtVerify } from "jose";

type Client = ReturnType<typeof createClient>;

let dbClient: Client | null = null;

export function getDbClient(): Client {
  if (!dbClient) {
    const url = process.env.VITE_TURSO_DATABASE_URL!;
    const token = process.env.VITE_TURSO_AUTH_TOKEN!;
    dbClient = createClient({ url, authToken: token });
  }
  return dbClient;
}

export function getListingsTable(): string {
  return process.env.VITE_TURSO_LISTINGS_TABLE || "shopmod_listings";
}

export function getOrdersTable(): string {
  return process.env.VITE_TURSO_ORDERS_TABLE || "shopmod_orders";
}

export function getPresenceTable(): string {
  return process.env.VITE_TURSO_PRESENCE_TABLE || "shopmod_presence";
}

export function getMessagesTable(): string {
  return process.env.VITE_TURSO_MESSAGES_TABLE || "shopmod_messages";
}

export function getAnomaliesTable(): string {
  return process.env.VITE_TURSO_ANOMALIES_TABLE || "shopmod_anomalies";
}

export function getRolesTable(): string {
  return process.env.VITE_TURSO_ROLES_TABLE || "shopmod_roles";
}

export function getAuditLogTable(): string {
  return process.env.VITE_TURSO_AUDIT_TABLE || "shopmod_audit_log";
}

export function getCatalogTable(): string {
  return process.env.VITE_TURSO_CATALOG_TABLE || "shopmod_item_catalog";
}

export interface JwtPayload {
  discordId: string;
  username: string;
  avatar: string | null;
}

export async function verifyJwt(req: VercelRequest): Promise<JwtPayload | null> {
  const token = req.cookies?.session as string | undefined;
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export async function checkListingPermission(discordId: string): Promise<boolean> {
  return (await checkSuperAdmin(discordId)) || (await checkWarehouseStaff(discordId));
}

export async function checkSuperAdmin(discordId: string): Promise<boolean> {
  const ids = (process.env.SUPER_ADMIN_IDS || "").split(/[,\s]+/).filter(Boolean);
  if (ids.length === 0) return false;
  return ids.includes(discordId);
}

export async function checkWarehouseStaff(discordId: string): Promise<boolean> {
  // 1. Check env var (legacy / bootstrap)
  const envIds = (process.env.WAREHOUSE_STAFF_IDS || "").split(/[,\s]+/).filter(Boolean);
  if (envIds.includes(discordId)) return true;
  // 2. Check DB
  try {
    const db = getDbClient();
    const result = await db.execute({
      sql: `SELECT 1 FROM ${getRolesTable()} WHERE user_id = ? AND role = 'warehouse_staff' LIMIT 1`,
      args: [discordId],
    });
    return (result.rows?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function writeAuditLog(opts: {
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  detail?: string;
}): Promise<void> {
  try {
    const db = getDbClient();
    await db.execute({
      sql: `INSERT INTO ${getAuditLogTable()} (actor_id, actor_name, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [opts.actorId, opts.actorName, opts.action, opts.targetType, opts.targetId, opts.detail || ""],
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}
