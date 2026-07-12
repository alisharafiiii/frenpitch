import { getUserPicks, redis } from "./db";

/** which match should this user's droid be watching right now?
 *  pinned match wins; otherwise fall back to the most recent open pick
 *  (auto mode). null = no target → droid gets the unfiltered feed. */
export async function resolveFollowedMatch(userId: string): Promise<string | null> {
  const raw = await redis().hgetall<Record<string, string>>(`droid:${userId}:follow`);
  if (raw && raw.mode === "match" && raw.matchId) return String(raw.matchId);

  // auto: latest open pick
  const picks = await getUserPicks(userId, 10);
  const open = picks.find((p) => p.status === "open");
  return open ? open.matchId : null;
}
