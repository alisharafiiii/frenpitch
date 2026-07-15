import { redis } from "@/app/lib/server/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET /api/droid/tts?text= — elevenlabs speech for the droid.
 *  returns raw 16khz 16-bit mono pcm, ready for M5.Speaker.playRaw
 *  (same audio path as sauron-eye's announce). the api key lives here,
 *  server-side only — the droid never holds it.
 *
 *  guards: 140 chars max, 400 calls/day (redis counter), and a
 *  warm-instance cache so repeated phrases ("goal!") cost nothing. */

const VOICE = process.env.ELEVENLABS_VOICE_ID ?? "pNInz6obpgDQGcFmaJgB"; // adam
const cache = new Map<string, ArrayBuffer>();

export async function GET(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return new Response("tts not configured", { status: 503 });

  const text = (new URL(req.url).searchParams.get("text") ?? "").trim().slice(0, 140);
  if (!text) return new Response("text required", { status: 400 });

  const cached = cache.get(text);
  if (cached) {
    return new Response(cached, { headers: { "Content-Type": "audio/pcm" } });
  }

  // daily budget — a chatty droid shouldn't drain the credits
  const day = new Date().toISOString().slice(0, 10);
  const used = await redis().incr(`tts:count:${day}`);
  if (used === 1) await redis().expire(`tts:count:${day}`, 90000);
  if (used > 400) return new Response("daily tts budget spent", { status: 429 });

  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=pcm_16000`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_flash_v2" }),
    }
  );
  if (!r.ok) return new Response("tts failed", { status: 502 });

  const pcm = await r.arrayBuffer();
  if (cache.size > 50) cache.clear(); // crude but bounded
  cache.set(text, pcm);
  return new Response(pcm, { headers: { "Content-Type": "audio/pcm" } });
}
