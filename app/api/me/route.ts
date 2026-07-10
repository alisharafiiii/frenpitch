import { NextResponse } from "next/server";
import { identityFromRequest } from "@/app/lib/server/auth";
import { getOrCreateUser, getUserPicks } from "@/app/lib/server/db";

export const dynamic = "force-dynamic";

/** GET /api/me — login-or-signup in one call.
 *  tg identity comes from the x-init-data header (validated). */
export async function GET(req: Request) {
  const who = identityFromRequest(req);
  const user = await getOrCreateUser(who.id, who.username, who.name, who.photoUrl);
  const picks = await getUserPicks(who.id);
  return NextResponse.json({ user, picks });
}
