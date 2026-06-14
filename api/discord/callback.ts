import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SignJWT } from "jose";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = req.query.code as string | undefined;
  if (!code) {
    return res.redirect("/?error=missing_code");
  }

  const clientId = process.env.DISCORD_CLIENT_ID!;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET!;
  const redirectUri = process.env.DISCORD_REDIRECT_URI!;
  const jwtSecret = process.env.JWT_SECRET!;

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("Discord token exchange failed:", err);
      return res.redirect("/?error=token_exchange_failed");
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };

    // Fetch user info
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      return res.redirect("/?error=user_fetch_failed");
    }

    const user = (await userRes.json()) as {
      id: string;
      username: string;
      avatar: string | null;
      global_name: string | null;
    };

    // Sign JWT
    const secret = new TextEncoder().encode(jwtSecret);
    const jwt = await new SignJWT({
      discordId: user.id,
      username: user.global_name || user.username,
      avatar: user.avatar,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(secret);

    // Set httpOnly cookie
    const isProd = process.env.NODE_ENV === "production";
    const cookieParts = [
      `session=${jwt}`,
      "HttpOnly",
      "SameSite=Lax",
      "Path=/",
      "Max-Age=604800", // 7 days
    ];
    if (isProd) cookieParts.push("Secure");

    res.setHeader("Set-Cookie", cookieParts.join("; "));
    res.redirect("/");
  } catch (err) {
    console.error("Discord OAuth callback error:", err);
    res.redirect("/?error=auth_failed");
  }
}
