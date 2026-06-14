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
  // Check if user is in the allowed user ID whitelist
  const allowedIds = (process.env.ALLOWED_LISTING_USER_IDS || "")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (allowedIds.length === 0) return false;
  return allowedIds.includes(discordId);
}
