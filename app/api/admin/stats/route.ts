import { NextResponse } from "next/server";
import { identityFromRequest } from "@/app/lib/server/auth";
import { getUserPicks, redis, type PickRecord, type UserRecord } from "@/app/lib/server/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/admin/stats — the numbers, by time and activity.
 *  admin only (ADMIN_TG_ID). one scan over users + their pick lists —
 *  fine at community scale, revisit past ~1k users. */

const DAY = 86_400_000;

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(5, 10); // MM-DD
}

export async function GET(req: Request) {
  const who = identityFromRequest(req);
  const admin = process.env.ADMIN_TG_ID;
  if (!admin || who.id !== admin) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const now = Date.now();
  const ids = (await redis().smembers("users")).map(String).filter((id) => id !== "demo");

  // users (batched)
  const users: UserRecord[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const batch = await Promise.all(
      ids.slice(i, i + 20).map(async (id) => {
        const u = await redis().hgetall<Record<string, string | number>>(`user:${id}`);
        return u && u.id ? (u as unknown as UserRecord) : null;
      })
    );
    for (const u of batch) if (u) users.push(u);
  }

  // picks (newest 50 per user covers the whole hackathon window)
  const allPicks: PickRecord[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const batch = await Promise.all(ids.slice(i, i + 10).map((id) => getUserPicks(id, 50)));
    for (const list of batch) allPicks.push(...list);
  }

  // ---- activity ----
  const active24h = users.filter((u) => now - Number(u.lastSeen) < DAY).length;
  const active7d = users.filter((u) => now - Number(u.lastSeen) < 7 * DAY).length;
  const newUsers24h = users.filter((u) => now - Number(u.createdAt) < DAY).length;

  // ---- per-day series (last 7 days) ----
  const days: { day: string; picks: number; staked: number; signups: number }[] = [];
  for (let d = 6; d >= 0; d--) {
    const start = now - d * DAY;
    const key = dayKey(start);
    const dayPicks = allPicks.filter((p) => dayKey(Number(p.createdAt)) === key);
    days.push({
      day: key,
      picks: dayPicks.length,
      staked: dayPicks.reduce((s, p) => s + Number(p.stake), 0),
      signups: users.filter((u) => dayKey(Number(u.createdAt)) === key).length,
    });
  }

  // ---- picks breakdown ----
  const open = allPicks.filter((p) => p.status === "open");
  const won = allPicks.filter((p) => p.status === "won");
  const lost = allPicks.filter((p) => p.status === "lost");
  const totalStaked = allPicks.reduce((s, p) => s + Number(p.stake), 0);
  const openStaked = open.reduce((s, p) => s + Number(p.stake), 0);

  // ---- tournaments ----
  const tourCodes: string[] = [];
  let cursor = "0";
  let guard = 0;
  do {
    const [next, keys] = await redis().scan(cursor, { match: "tour:*:members", count: 100 });
    cursor = String(next);
    for (const k of keys) tourCodes.push(String(k).split(":")[1]);
    guard++;
  } while (cursor !== "0" && guard < 20);

  // ---- leaders ----
  const byPnl = [...users].sort((a, b) => Number(b.pnl) - Number(a.pnl));
  const leaders = byPnl.slice(0, 5).map((u) => ({
    handle: String(u.username),
    pnl: Number(u.pnl),
  }));

  return NextResponse.json({
    at: now,
    users: {
      total: users.length,
      active24h,
      active7d,
      new24h: newUsers24h,
    },
    picks: {
      total: allPicks.length,
      open: open.length,
      won: won.length,
      lost: lost.length,
      totalStaked,
      openStaked,
    },
    tournaments: tourCodes.length,
    days,
    leaders,
  });
}
