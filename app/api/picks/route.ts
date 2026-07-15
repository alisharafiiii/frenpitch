import { NextResponse } from "next/server";
import { identityFromRequest } from "@/app/lib/server/auth";
import { createPick, getOrCreateUser, getUserPicks, type PickRecord } from "@/app/lib/server/db";

export const dynamic = "force-dynamic";

/** POST /api/picks — lock a pick. body:
 *  { matchId, matchLabel, outcome, outcomeLabel, lockedOdds, stake } */
export async function POST(req: Request) {
  const who = identityFromRequest(req);
  const user = await getOrCreateUser(who.id, who.username, who.name, who.photoUrl);

  const body = (await req.json()) as Partial<PickRecord>;
  const stake = Number(body.stake);
  const lockedOdds = Number(body.lockedOdds);
  const market = body.market === "totals" ? "totals" : "1x2";

  const validOutcome =
    market === "totals"
      ? body.outcome === "over" || body.outcome === "under"
      : body.outcome === "home" || body.outcome === "draw" || body.outcome === "away";
  const line = Number(body.line);
  if (
    !body.matchId ||
    !validOutcome ||
    !stake ||
    stake <= 0 ||
    !lockedOdds ||
    lockedOdds <= 1 ||
    (market === "totals" && (!Number.isFinite(line) || line <= 0))
  ) {
    return NextResponse.json({ error: "invalid pick" }, { status: 400 });
  }
  if (stake > user.bankroll) {
    return NextResponse.json({ error: "not enough points" }, { status: 400 });
  }

  const pick: PickRecord = {
    id: `p${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    userId: who.id,
    matchId: String(body.matchId),
    matchLabel: String(body.matchLabel ?? ""),
    outcome: body.outcome as PickRecord["outcome"],
    outcomeLabel: String(body.outcomeLabel ?? body.outcome),
    market,
    ...(market === "totals" ? { line } : {}),
    lockedOdds,
    stake,
    status: "open",
    createdAt: Date.now(),
  };
  await createPick(pick);
  return NextResponse.json({ pick, bankroll: user.bankroll - stake });
}

/** GET /api/picks?limit= — my picks, newest first */
export async function GET(req: Request) {
  const who = identityFromRequest(req);
  const limit = Math.min(50, Number(new URL(req.url).searchParams.get("limit")) || 10);
  const picks = await getUserPicks(who.id, limit);
  return NextResponse.json({ picks });
}
