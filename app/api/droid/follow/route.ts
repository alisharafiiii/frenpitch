import { NextResponse } from "next/server";
import { identityFromRequest } from "@/app/lib/server/auth";
import { redis } from "@/app/lib/server/db";
import { resolveFollowedMatch } from "@/app/lib/server/droid";

export const dynamic = "force-dynamic";

/** droid follow — which match the paired stackchan tracks.
 *  key: droid:{userId}:follow  hash → { mode, matchId?, matchLabel? }
 *  mode "auto"  = follow the user's most recent open pick
 *  mode "match" = pinned to a specific fixture
 *  changing it in the app retargets the droid instantly (server-side
 *  filtering on /api/feed) — no reflash, no touching the device. */

interface FollowSetting {
  mode: "auto" | "match";
  matchId?: string;
  matchLabel?: string;
}

/** GET — current setting + the matchId it currently resolves to */
export async function GET(req: Request) {
  const who = identityFromRequest(req);
  const raw = await redis().hgetall<Record<string, string>>(`droid:${who.id}:follow`);
  const setting: FollowSetting =
    raw && raw.mode === "match" && raw.matchId
      ? { mode: "match", matchId: String(raw.matchId), matchLabel: raw.matchLabel ? String(raw.matchLabel) : undefined }
      : { mode: "auto" };

  const resolved = await resolveFollowedMatch(who.id);
  return NextResponse.json({ setting, resolvedMatchId: resolved });
}

/** POST — update setting. body: { mode: "auto" } | { mode: "match", matchId, matchLabel? } */
export async function POST(req: Request) {
  const who = identityFromRequest(req);
  const body = (await req.json()) as FollowSetting;

  if (body.mode === "match") {
    if (!body.matchId) {
      return NextResponse.json({ error: "matchId required" }, { status: 400 });
    }
    await redis().hset(`droid:${who.id}:follow`, {
      mode: "match",
      matchId: String(body.matchId),
      ...(body.matchLabel ? { matchLabel: body.matchLabel } : {}),
    });
  } else {
    await redis().del(`droid:${who.id}:follow`);
  }

  const resolved = await resolveFollowedMatch(who.id);
  return NextResponse.json({ ok: true, resolvedMatchId: resolved });
}
