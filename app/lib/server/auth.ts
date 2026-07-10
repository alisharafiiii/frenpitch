import crypto from "node:crypto";

/** telegram webapp initData validation (HMAC, per tg docs).
 *  the client sends window.Telegram.WebApp.initData in the
 *  "x-init-data" header; we verify it server-side with the bot token
 *  so nobody can impersonate a fren. */

export interface TgIdentity {
  id: string;
  username: string;
  name: string;
  photoUrl?: string;
}

export function verifyInitData(initData: string): TgIdentity | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (expected !== hash) return null;

  // freshness: reject initData older than 24h
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

  try {
    const user = JSON.parse(params.get("user") ?? "{}") as {
      id: number;
      first_name: string;
      username?: string;
      photo_url?: string;
    };
    if (!user.id) return null;
    return {
      id: String(user.id),
      username: user.username ?? user.first_name.toLowerCase(),
      name: user.first_name,
      photoUrl: user.photo_url,
    };
  } catch {
    return null;
  }
}

/** resolve identity from a request. outside telegram (plain browser),
 *  falls back to a shared demo identity so the deployed link still
 *  works for judges opening it in a normal browser. */
export function identityFromRequest(req: Request): TgIdentity {
  const initData = req.headers.get("x-init-data") ?? "";
  const verified = verifyInitData(initData);
  if (verified) return verified;
  return { id: "demo", username: "demo fren", name: "demo" };
}
