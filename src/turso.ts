import { createClient } from "@libsql/client/web";

type Client = ReturnType<typeof createClient>;

let client: Client | null = null;

function getClient(): Client {
  if (!client) {
    const url = import.meta.env.VITE_TURSO_DATABASE_URL as string;
    const token = import.meta.env.VITE_TURSO_AUTH_TOKEN as string;
    if (!url || !token) {
      throw new Error("缺少 VITE_TURSO_DATABASE_URL 或 VITE_TURSO_AUTH_TOKEN 環境變數");
    }
    client = createClient({ url, authToken: token });
  }
  return client;
}

export interface ChestItem {
  slot: number;
  itemName: string;
  itemId: string;
  count: number;
  itemComponents: string;
  tooltipLines: string[];
}

export interface WarehouseChest {
  capturedAt: string;
  dimension: string;
  pos: { x: number; y: number; z: number };
  items: ChestItem[];
}

export interface WarehouseData {
  uploadedAt: string;
  chests: WarehouseChest[];
}

export async function fetchWarehouseData(): Promise<WarehouseData> {
  const table = (import.meta.env.VITE_TURSO_WAREHOUSE_TABLE as string) || "shopmod_warehouse_chests";
  const c = getClient();
  const result = await c.execute(
    `SELECT uploaded_at, json_payload FROM ${table} WHERE id = 1 LIMIT 1`
  );
  if (result.rows.length === 0) {
    return { uploadedAt: "", chests: [] };
  }
  const row = result.rows[0];
  const uploadedAt = String(row.uploaded_at ?? "");
  const raw = String(row.json_payload ?? "");
  if (!raw) return { uploadedAt, chests: [] };

  const parsed = JSON.parse(raw) as { chests?: WarehouseChest[] };
  return {
    uploadedAt,
    chests: Array.isArray(parsed.chests) ? parsed.chests : [],
  };
}
