import { NextResponse } from "next/server";
import { identityFromRequest } from "@/app/lib/server/auth";
import { getAllUsers, getOrCreateUser, redis } from "@/app/lib/server/db";

export const dynamic = "force-dynamic";

/** quiz stats + daily challenge.
 *  user hash gains: quizPoints, quizGames, quizCorrect, quizAnswered
 *  daily counter:   quizdaily:{id}:{yyyy-mm-dd} (48h ttl) + :claimed
 */

const DAILY_TARGET = 10;
const DAILY_REWARD = 500;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function msToUtcMidnight(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.getTime() - now.getTime();
}

/** GET — my quiz stats */
export async function GET(req: Request) {
  const who = identityFromRequest(req);
  const user = await getOrCreateUser(who.id, who.username, who.name, who.photoUrl);

  const u = await redis().hgetall<Record<string, string | number>>(`user:${who.id}`);
  const quizPoints = Number(u?.quizPoints ?? 0);
  const quizGames = Number(u?.quizGames ?? 0);
  const quizCorrect = Number(u?.quizCorrect ?? 0);
  const quizAnswered = Number(u?.quizAnswered ?? 0);
  const bestStreak = Number(u?.quizBestStreak ?? 0);

  // global rank by quiz points (small user counts — fine to compute live)
  const all = await getAllUsers(200);
  const ranked = await Promise.all(
    all.map(async (usr) => {
      const p = await redis().hget<number>(`user:${usr.id}`, "quizPoints");
      return { id: usr.id, pts: Number(p ?? 0) };
    })
  );
  ranked.sort((a, b) => b.pts - a.pts);
  const rank = ranked.findIndex((r) => r.id === who.id) + 1;

  const daily = Number((await redis().get(`quizdaily:${who.id}:${today()}`)) ?? 0);
  const claimed = Boolean(await redis().get(`quizdaily:${who.id}:${today()}:claimed`));

  return NextResponse.json({
    quizPoints,
    gamesPlayed: quizGames,
    accuracy: quizAnswered > 0 ? Math.round((quizCorrect / quizAnswered) * 100) : null,
    bestStreak,
    rank: rank > 0 ? rank : null,
    players: ranked.length,
    daily: { done: Math.min(daily, DAILY_TARGET), target: DAILY_TARGET, reward: DAILY_REWARD, claimed },
    resetsInMs: msToUtcMidnight(),
    handle: user.username,
  });
}

/** POST — report quiz activity.
 *  body: { type: "answer", correct, points, streak } | { type: "game" } */
export async function POST(req: Request) {
  const who = identityFromRequest(req);
  await getOrCreateUser(who.id, who.username, who.name, who.photoUrl);
  const body = (await req.json()) as {
    type?: string;
    correct?: boolean;
    points?: number;
    streak?: number;
  };
  const key = `user:${who.id}`;

  if (body.type === "game") {
    await redis().hincrby(key, "quizGames", 1);
    return NextResponse.json({ ok: true });
  }

  if (body.type === "answer") {
    await redis().hincrby(key, "quizAnswered", 1);
    if (body.correct) {
      await redis().hincrby(key, "quizCorrect", 1);
      await redis().hincrby(key, "quizPoints", Number(body.points ?? 1));

      // best streak
      const streak = Number(body.streak ?? 0);
      const best = Number((await redis().hget(key, "quizBestStreak")) ?? 0);
      if (streak > best) await redis().hset(key, { quizBestStreak: streak });

      // daily challenge
      const dkey = `quizdaily:${who.id}:${today()}`;
      const done = await redis().incr(dkey);
      await redis().expire(dkey, 48 * 3600);
      if (done === 10) {
        const ckey = `${dkey}:claimed`;
        const first = await redis().set(ckey, "1", { nx: true, ex: 48 * 3600 });
        if (first) {
          await redis().hincrby(key, "quizPoints", 500);
          return NextResponse.json({ ok: true, dailyComplete: true, bonus: 500 });
        }
      }
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown type" }, { status: 400 });
}
