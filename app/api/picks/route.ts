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
  const market: NonNullable<PickRecord["market"]> =
    body.market === "totals" || body.market === "totals1h" || body.market === "ah"
      ? body.market
      : "1x2";

  const isTotals = market === "totals" || market === "totals1h";
  const validOutcome = isTotals
    ? body.outcome === "over" || body.outcome === "under"
    : market === "ah"
      ? body.outcome === "home" || body.outcome === "away"
      : body.outcome === "home" || body.outcome === "draw" || body.outcome === "away";
  const line = Number(body.line);
  const needsLine = market !== "1x2";
  const validLine = isTotals ? Number.isFinite(line) && line > 0 : Number.isFinite(line);
  if (
    !body.matchId ||
    !validOutcome ||
    !stake ||
    stake <= 0 ||
    !lockedOdds ||
    lockedOdds <= 1 ||
    (needsLine && !validLine)
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
    ...(market !== "1x2" ? { line } : {}),
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
