import { Redis } from "@upstash/redis";

/** upstash redis — the fren layer's memory.
 *  keys:
 *    user:{tgId}            hash → UserRecord
 *    users                  set  → all tgIds
 *    pick:{pickId}          hash → PickRecord
 *    user:{tgId}:picks      list → pickIds (newest first)
 *    picks:open             set  → open pickIds (for the settler)
 *    tour:{code}            hash → TournamentRecord
 *    tour:{code}:members    set  → tgIds
 */
let _redis: Redis | null = null;

/** lazy init — vercel evaluates modules at build time before env vars
 *  exist, so the client must only connect on the first real request */
export function redis(): Redis {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

export interface UserRecord {
  id: string; // tg id
  username: string;
  name: string;
  photoUrl?: string;
  bankroll: number; // matchday points
  pnl: number;
  streak: number;
  createdAt: number;
  lastSeen: number;
}

export interface PickRecord {
  id: string;
  userId: string;
  matchId: string;
  matchLabel: string;
  outcome: "home" | "draw" | "away";
  outcomeLabel: string;
  lockedOdds: number;
  stake: number;
  status: "open" | "won" | "lost";
  createdAt: number;
}

export interface TournamentRecord {
  code: string; // short invite code
  pass?: string; // optional passcode set by the creator (minted mind style)
  name: string;
  buyInUsdc: number;
  split: string;
  creatorId: string;
  maxFrens: number;
  status: "open" | "live" | "settled";
  createdAt: number;
}

const DAILY_BANKROLL = 1000;

export async function getOrCreateUser(
  id: string,
  username: string,
  name: string,
  photoUrl?: string
): Promise<UserRecord> {
  const key = `user:${id}`;
  const existing = await redis().hgetall<Record<string, string | number>>(key);
  if (existing && existing.id) {
    await redis().hset(key, { lastSeen: Date.now(), username, name, ...(photoUrl ? { photoUrl } : {}) });
    return {
      ...(existing as unknown as UserRecord),
      username,
      name,
      bankroll: Number(existing.bankroll),
      pnl: Number(existing.pnl),
      streak: Number(existing.streak),
    };
  }
  const user: UserRecord = {
    id,
    username,
    name,
    ...(photoUrl ? { photoUrl } : {}), // upstash rejects null/undefined values
    bankroll: DAILY_BANKROLL,
    pnl: 0,
    streak: 0,
    createdAt: Date.now(),
    lastSeen: Date.now(),
  };
  await redis().hset(key, user as unknown as Record<string, unknown>);
  await redis().sadd("users", id);
  return user;
}

export async function getUser(id: string): Promise<UserRecord | null> {
  const u = await redis().hgetall<Record<string, string | number>>(`user:${id}`);
  if (!u || !u.id) return null;
  return {
    ...(u as unknown as UserRecord),
    // upstash auto-deserializes: numeric strings come back as numbers.
    // coerce explicitly so string ops (iteration, comparison) never break.
    id: String(u.id),
    username: String(u.username),
    name: String(u.name),
    bankroll: Number(u.bankroll),
    pnl: Number(u.pnl),
    streak: Number(u.streak),
    lastSeen: Number(u.lastSeen),
    createdAt: Number(u.createdAt),
  };
}

export async function getAllUsers(limit = 50): Promise<UserRecord[]> {
  const ids = await redis().smembers("users");
  const users = await Promise.all(ids.slice(0, limit).map((id) => getUser(String(id))));
  return users.filter((u): u is UserRecord => u !== null);
}

export async function createPick(pick: PickRecord): Promise<void> {
  await redis().hset(`pick:${pick.id}`, pick as unknown as Record<string, unknown>);
  await redis().lpush(`user:${pick.userId}:picks`, pick.id);
  await redis().sadd("picks:open", pick.id);
  await redis().hincrby(`user:${pick.userId}`, "bankroll", -pick.stake);
}

export async function getPick(id: string): Promise<PickRecord | null> {
  const p = await redis().hgetall<Record<string, string | number>>(`pick:${id}`);
  if (!p || !p.id) return null;
  return {
    ...(p as unknown as PickRecord),
    id: String(p.id),
    userId: String(p.userId),
    matchId: String(p.matchId), // numeric fixture ids must stay strings
    lockedOdds: Number(p.lockedOdds),
    stake: Number(p.stake),
    createdAt: Number(p.createdAt),
  };
}

export async function getUserPicks(userId: string, limit = 10): Promise<PickRecord[]> {
  const ids = await redis().lrange(`user:${userId}:picks`, 0, limit - 1);
  const picks = await Promise.all(ids.map((id) => getPick(String(id))));
  return picks.filter((p): p is PickRecord => p !== null);
}

export async function createTournament(t: TournamentRecord): Promise<void> {
  await redis().hset(`tour:${t.code}`, t as unknown as Record<string, unknown>);
  await redis().sadd(`tour:${t.code}:members`, t.creatorId);
  await redis().sadd(`user:${t.creatorId}:tours`, t.code);
}

export async function getTournament(code: string): Promise<TournamentRecord | null> {
  const t = await redis().hgetall<Record<string, string | number>>(`tour:${code}`);
  if (!t || !t.code) return null;
  return {
    ...(t as unknown as TournamentRecord),
    code: String(t.code),
    creatorId: String(t.creatorId),
    ...(t.pass !== undefined && t.pass !== null ? { pass: String(t.pass) } : {}),
    buyInUsdc: Number(t.buyInUsdc),
    maxFrens: Number(t.maxFrens),
    createdAt: Number(t.createdAt),
  };
}

export async function joinTournament(
  code: string,
  userId: string,
  pass?: string
): Promise<"ok" | "pass_required" | "closed"> {
  const t = await getTournament(code);
  if (!t || t.status !== "open") return "closed";
  if (t.pass && t.pass !== (pass ?? "")) return "pass_required";
  const size = await redis().scard(`tour:${code}:members`);
  if (size >= t.maxFrens) return "closed";
  await redis().sadd(`tour:${code}:members`, userId);
  await redis().sadd(`user:${userId}:tours`, code);
  return "ok";
}

/** backfill: find tournaments created/joined before the per-user index
 *  existed by scanning tour:* keys and checking membership. self-heals
 *  the user's tours set so the scan only ever runs once per user. */
async function backfillUserTours(userId: string): Promise<string[]> {
  const found: string[] = [];
  let cursor = "0";
  let guard = 0;
  do {
    const [next, keys] = await redis().scan(cursor, { match: "tour:*:members", count: 100 });
    cursor = String(next);
    for (const key of keys) {
      const code = String(key).split(":")[1];
      const isMember = await redis().sismember(String(key), userId);
      if (isMember) {
        found.push(code);
        await redis().sadd(`user:${userId}:tours`, code);
      }
    }
    guard++;
  } while (cursor !== "0" && guard < 20);
  return found;
}

/** all tournaments a user created or joined, with live member counts */
export async function getUserTournaments(
  userId: string
): Promise<(TournamentRecord & { memberCount: number })[]> {
  let codes = await redis().smembers(`user:${userId}:tours`);
  if (codes.length === 0) {
    codes = await backfillUserTours(userId);
  }
  const tours = await Promise.all(
    codes.map(async (code) => {
      const t = await getTournament(String(code));
      if (!t) return null;
      const memberCount = await redis().scard(`tour:${code}:members`);
      return { ...t, memberCount };
    })
  );
  return tours
    .filter((t): t is TournamentRecord & { memberCount: number } => t !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getTournamentMembers(code: string): Promise<UserRecord[]> {
  const ids = await redis().smembers(`tour:${code}:members`);
  const users = await Promise.all(ids.map((id) => getUser(String(id))));
  return users.filter((u): u is UserRecord => u !== null);
}
