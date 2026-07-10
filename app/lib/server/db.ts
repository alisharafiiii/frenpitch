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
function redis(): Redis {
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
  code: string; // short invite code, also the passcode
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
    photoUrl,
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
    bankroll: Number(u.bankroll),
    pnl: Number(u.pnl),
    streak: Number(u.streak),
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
}

export async function getTournament(code: string): Promise<TournamentRecord | null> {
  const t = await redis().hgetall<Record<string, string | number>>(`tour:${code}`);
  if (!t || !t.code) return null;
  return {
    ...(t as unknown as TournamentRecord),
    buyInUsdc: Number(t.buyInUsdc),
    maxFrens: Number(t.maxFrens),
    createdAt: Number(t.createdAt),
  };
}

export async function joinTournament(code: string, userId: string): Promise<boolean> {
  const t = await getTournament(code);
  if (!t || t.status !== "open") return false;
  const size = await redis().scard(`tour:${code}:members`);
  if (size >= t.maxFrens) return false;
  await redis().sadd(`tour:${code}:members`, userId);
  return true;
}

export async function getTournamentMembers(code: string): Promise<UserRecord[]> {
  const ids = await redis().smembers(`tour:${code}:members`);
  const users = await Promise.all(ids.map((id) => getUser(String(id))));
  return users.filter((u): u is UserRecord => u !== null);
}
