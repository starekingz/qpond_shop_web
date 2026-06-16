import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyJwt, checkListingPermission, checkSuperAdmin, checkWarehouseStaff } from "./_helpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const user = await verifyJwt(req);
  if (!user) {
    return res.status(401).json({ error: "not_authenticated" });
  }

  const [hasRole, isAdmin, isWarehouseStaff] = await Promise.all([
    checkListingPermission(user.discordId),
    checkSuperAdmin(user.discordId),
    checkWarehouseStaff(user.discordId),
  ]);
  return res.status(200).json({ hasRole, isAdmin, isWarehouseStaff });
}
