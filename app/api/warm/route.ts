import { NextResponse } from "next/server";
import {
  getApiToken,
  openStream,
  parseSseData,
  readSseMessages,
} from "@/app/lib/server/txline-server";
import {
  normalizeAhUpdate,
  normalizeOddsUpdate,
  normalizeTotalsUpdate,
} from "@/app/lib/server/normalize";
import { rememberPrices } from "@/app/lib/server/prices";
import { redis } from "@/app/lib/server/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/warm — keep the price memory warm when nobody's in the app.
 *  listens to the txline odds stream for ~25s and remembers every price
 *  (same path as /api/feed). pinged by a github actions cron every 5min.
 *  redis-locked so overlapping pings don't double-listen. */
export async function GET() {
  if (!getApiToken()) return NextResponse.json({ warmed: 0, reason: "no token" });

  const locked = await redis().set("warm:lock", "1", { nx: true, ex: 30 });
  if (!locked) return NextResponse.json({ warmed: 0, reason: "already warming" });

  let events = 0;
  let remembered = 0;
  const deadline = Date.now() + 25_000;

  try {
    const upstream = await openStream("/api/odds/stream");
    for await (const msg of readSseMessages(upstream)) {
      if (Date.now() > deadline) break;
      const data = parseSseData(msg.data);
      if (typeof data !== "object" || data === null) continue;
      const raw = data as Record<string, unknown>;
      events++;
      const e =
        normalizeTotalsUpdate(raw) ??
        normalizeAhUpdate(raw) ??
        normalizeOddsUpdate(raw);
      if (e) {
        rememberPrices(e);
        remembered++;
      }
    }
  } catch (err) {
    return NextResponse.json({ warmed: remembered, events, error: String(err).slice(0, 140) });
  }

  return NextResponse.json({ warmed: remembered, events });
}
