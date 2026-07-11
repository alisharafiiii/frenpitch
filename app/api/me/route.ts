import { NextResponse } from "next/server";
import { identityFromRequest } from "@/app/lib/server/auth";
import { getOrCreateUser, getUserPicks } from "@/app/lib/server/db";
import { settleAll } from "@/app/lib/server/settle";

export const dynamic = "force-dynamic";

/** GET /api/me — login-or-signup in one call.
 *  tg identity comes from the x-init-data header (validated).
 *  also opportunistically settles finished matches (lock-throttled),
 *  so results land as soon as anyone opens the app. */
export async function GET(req: Request) {
  const who = identityFromRequest(req);

  // self-settling app: fire-and-forget, throttled by redis lock
  settleAll().catch(() => {});

  const user = await getOrCreateUser(who.id, who.username, who.name, who.photoUrl);
  const picks = await getUserPicks(who.id);
  return NextResponse.json({ user, picks });
}
