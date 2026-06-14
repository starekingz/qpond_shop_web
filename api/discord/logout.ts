import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
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
  res.status(200).json({ success: true });
}
