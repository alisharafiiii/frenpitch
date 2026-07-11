import { NextResponse } from "next/server";
import { identityFromRequest } from "@/app/lib/server/auth";
import { redis } from "@/app/lib/server/db";
import { settleAll } from "@/app/lib/server/settle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/settle — run the settler (cron backstop + manual trigger) */
export async function GET() {
  const report = await settleAll({ force: true });
  return NextResponse.json(report);
}

/** POST /api/settle — admin override: force a match result.
 *  body: { matchId, outcome: "home" | "draw" | "away" }
 *  only the admin tg id (ADMIN_TG_ID env) may call this. */
export async function POST(req: Request) {
  const who = identityFromRequest(req);
  const admin = process.env.ADMIN_TG_ID;
  if (!admin || who.id !== admin) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }
  const { matchId, outcome } = (await req.json()) as {
    matchId?: string;
    outcome?: "home" | "draw" | "away";
  };
  if (!matchId || !outcome || !["home", "draw", "away"].includes(outcome)) {
    return NextResponse.json({ error: "matchId + outcome required" }, { status: 400 });
  }
  await redis().set(`match:${matchId}:result`, outcome, { ex: 7 * 86400 });
  const report = await settleAll({ force: true });
  return NextResponse.json({ forced: `${matchId}:${outcome}`, ...report });
}
