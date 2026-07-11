import { redis } from "@/app/lib/server/db";

export const dynamic = "force-dynamic";

/** GET /api/avatar/[id] — proxies the user's telegram profile photo.
 *  telegram only exposes pfps through the bot api, and file urls embed
 *  the bot token — so we fetch server-side and stream the bytes.
 *  falls back to 404 → the ui shows the initials avatar. */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const id = params.id;
  if (!token || !id || !/^\d+$/.test(id)) {
    return new Response(null, { status: 404 });
  }

  const cacheKey = `user:${id}:photopath`;
  let path = await redis().get<string>(cacheKey);
  if (path === "none") return new Response(null, { status: 404 });

  if (!path) {
    const photos = (await fetch(
      `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${id}&limit=1`
    ).then((r) => r.json())) as {
      result?: { photos?: { file_id: string }[][] };
    };
    const sizes = photos.result?.photos?.[0];
    const fileId = sizes?.[Math.min(1, (sizes?.length ?? 1) - 1)]?.file_id;
    if (!fileId) {
      await redis().set(cacheKey, "none", { ex: 21600 });
      return new Response(null, { status: 404 });
    }
    const file = (await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
    ).then((r) => r.json())) as { result?: { file_path?: string } };
    path = file.result?.file_path ?? null;
    if (!path) {
      await redis().set(cacheKey, "none", { ex: 21600 });
      return new Response(null, { status: 404 });
    }
    await redis().set(cacheKey, path, { ex: 21600 });
  }

  const img = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
  if (!img.ok || !img.body) return new Response(null, { status: 404 });

  return new Response(img.body, {
    headers: {
      "Content-Type": img.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
