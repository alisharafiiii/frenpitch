import { NextResponse } from "next/server";
import { identityFromRequest } from "@/app/lib/server/auth";
import { getUserTournaments } from "@/app/lib/server/db";

export const dynamic = "force-dynamic";

/** GET /api/tournaments/mine — my tournaments with LIVE pool sizes:
 *  pool = buyIn × members who actually joined (grows per join). */
export async function GET(req: Request) {
  const who = identityFromRequest(req);
  const tours = await getUserTournaments(who.id);
  return NextResponse.json({
    tournaments: tours.map((t) => ({
      code: t.code,
      name: t.name,
      buyInUsdc: t.buyInUsdc,
      split: t.split,
      status: t.status,
      maxFrens: t.maxFrens,
      memberCount: t.memberCount,
      pool: t.buyInUsdc * t.memberCount,
      hasPass: Boolean(t.pass),
      isCreator: t.creatorId === who.id,
    })),
  });
}
