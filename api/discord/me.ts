import type { VercelRequest, VercelResponse } from "@vercel/node";
import { jwtVerify } from "jose";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.cookies?.session as string | undefined;

  if (!token) {
    return res.status(401).json({ error: "not_authenticated" });
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);

    return res.status(200).json({
      user: {
        discordId: payload.discordId,
        username: payload.username,
        avatar: payload.avatar,
      },
    });
  } catch {
    // JWT invalid or expired — clear the cookie
    const isProd = process.env.NODE_ENV === "production";
    const cookieParts = [
      "session=",
      "HttpOnly",
      "SameSite=Lax",
      "Path=/",
      "Max-Age=0",
    ];
    if (isProd) cookieParts.push("Secure");
    res.setHeader("Set-Cookie", cookieParts.join("; "));

    return res.status(401).json({ error: "invalid_session" });
  }
}
