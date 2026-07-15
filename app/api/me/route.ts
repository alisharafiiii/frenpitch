import { NextResponse } from "next/server";
import { identityFromRequest } from "@/app/lib/server/auth";
import { getOrCreateUser, getUserPicks } from "@/app/lib/server/db";
import { settleAll } from "@/app/lib/server/settle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/me — login-or-signup in one call.
 *  tg identity comes from the x-init-data header (validated).
 *  also opportunistically settles finished matches (lock-throttled),
 *  so results land as soon as anyone opens the app. */
export async function GET(req: Request) {
  const who = identityFromRequest(req);

  // self-settling app, throttled by redis lock. AWAITED on purpose:
  // vercel freezes the lambda the moment the response returns, so a
  // fire-and-forget promise silently never runs in prod (fra-esp sat
  // "live" for hours). the lock means only ~1 request per 90s pays
  // the settlement latency — everyone else no-ops instantly.
  try {
    await settleAll();
  } catch {
    /* never block login on settlement */
  }

  const user = await getOrCreateUser(who.id, who.username, who.name, who.photoUrl);
  const picks = await getUserPicks(who.id);
  return NextResponse.json({ user, picks });
}
