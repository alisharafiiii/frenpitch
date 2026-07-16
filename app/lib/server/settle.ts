import { redis, getPick, type PickRecord } from "./db";
import { getApiToken, txGet } from "./txline-server";

/** settlement engine — the moment of truth.
 *
 *  flow: open picks → group by match → ask txline if the match ended →
 *  winners get stake × locked odds back into their bankroll, pnl and
 *  streaks update, losers eat the stake. runs opportunistically when
 *  anyone opens the app (throttled by a redis lock) + manual /api/settle.
 *
 *  markets: 1x2 settles on the outcome; totals (over/under) settle on
 *  total goals vs the locked line — landing exactly on a whole line is
 *  a PUSH: stake refunded, no pnl, streak untouched.
 *
 *  match results can also be admin-forced (matchId → outcome) as the
 *  demo-day safety valve; forced results only resolve 1x2 picks (they
 *  carry no score), totals wait for real txline data. */

type Outcome = "home" | "draw" | "away";
type Raw = Record<string, unknown>;

interface MatchResult {
  outcome: Outcome;
  totalGoals: number | null; // null = unknown (admin-forced, no score)
  goalDiff: number | null; // home - away (for asian handicap)
  htTotalGoals: number | null; // first-half total (for 1H totals)
}

/** verified against real feed (NOR-ENG 2026-07-11):
 *  finished = Action "game_finalised" (StatusId 100), or StatusId 5/10/13
 *  (F / FET / FPE). final score lives in Stats["1"] / Stats["2"]. */
const FINISHED_STATUS = new Set([5, 10, 13, 100]);
const FINISHED_ACTIONS = new Set(["game_finalised", "match_ended", "finished"]);

function pick<T>(obj: Raw, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T;
  }
  return undefined;
}

/** final result from the txline scores snapshot */
async function fetchResult(matchId: string): Promise<MatchResult | null> {
  if (!getApiToken()) return null;
  let entries: Raw[];
  try {
    entries = await txGet<Raw[]>(`/api/scores/snapshot/${matchId}`);
  } catch {
    return null;
  }
  if (!Array.isArray(entries) || entries.length === 0) return null;

  // latest first
  const sorted = [...entries].sort(
    (a, b) => (pick<number>(b, "Ts") ?? 0) - (pick<number>(a, "Ts") ?? 0)
  );

  const finished = sorted.some((e) => {
    const status = Number(pick<number | string>(e, "StatusId") ?? -1);
    const action = String(pick<string>(e, "Action") ?? "").toLowerCase();
    return FINISHED_STATUS.has(status) || FINISHED_ACTIONS.has(action);
  });
  if (!finished) return null;

  // half-time score: the halftime_finalised entry (StatusId 3) carries
  // the 1H score in its flat Stats — verified on FRA-ESP 2026-07-15
  let htTotalGoals: number | null = null;
  for (const e of sorted) {
    const status = Number(pick<number | string>(e, "StatusId") ?? -1);
    const action = String(pick<string>(e, "Action") ?? "").toLowerCase();
    if (status === 3 || action.includes("halftime")) {
      const stats = pick<Record<string, number>>(e, "Stats", "stats");
      if (stats && stats["1"] !== undefined && stats["2"] !== undefined) {
        htTotalGoals = Number(stats["1"]) + Number(stats["2"]);
        break;
      }
    }
  }

  // final score from the most recent entry that carries Stats
  for (const e of sorted) {
    const stats = pick<Record<string, number>>(e, "Stats", "stats");
    if (stats && stats["1"] !== undefined && stats["2"] !== undefined) {
      const s1 = Number(stats["1"]);
      const s2 = Number(stats["2"]);
      return {
        outcome: s1 > s2 ? "home" : s1 < s2 ? "away" : "draw",
        totalGoals: s1 + s2,
        goalDiff: s1 - s2,
        htTotalGoals,
      };
    }
  }
  return null;
}

/** did this pick win / lose / push against the final result?
 *  null = cannot resolve yet (totals pick + forced result without score) */
function grade(p: PickRecord, r: MatchResult): "won" | "lost" | "push" | null {
  const line = Number(p.line);
  if (p.market === "totals" || p.market === "totals1h") {
    const total = p.market === "totals1h" ? r.htTotalGoals : r.totalGoals;
    if (total === null || !Number.isFinite(line)) return null;
    if (total === line) return "push"; // whole line landed exactly
    const overWon = total > line;
    return (p.outcome === "over") === overWon ? "won" : "lost";
  }
  if (p.market === "ah") {
    if (r.goalDiff === null || !Number.isFinite(line)) return null;
    // line applies to home: adjusted = (home - away) + line
    const adjusted = r.goalDiff + line;
    if (adjusted === 0) return "push"; // line 0 (or whole) + level result
    const homeCovered = adjusted > 0;
    return (p.outcome === "home") === homeCovered ? "won" : "lost";
  }
  return p.outcome === r.outcome ? "won" : "lost";
}

/** pay out a single pick */
async function applyResult(p: PickRecord, verdict: "won" | "lost" | "push"): Promise<void> {
  const userKey = `user:${p.userId}`;
  if (verdict === "won") {
    const payout = Math.round(p.stake * p.lockedOdds);
    await redis().hincrby(userKey, "bankroll", payout);
    await redis().hincrby(userKey, "pnl", payout - p.stake);
    await redis().hincrby(userKey, "streak", 1);
    await redis().hincrby(userKey, "picksWon", 1);
    // best win streak for the profile
    const u = await redis().hgetall<Record<string, string | number>>(userKey);
    const cur = Number(u?.streak ?? 0);
    if (cur > Number(u?.bestWinStreak ?? 0)) {
      await redis().hset(userKey, { bestWinStreak: cur });
    }
    await redis().hset(`pick:${p.id}`, { status: "won" });
  } else if (verdict === "push") {
    // stake back, nothing else moves
    await redis().hincrby(userKey, "bankroll", p.stake);
    await redis().hset(`pick:${p.id}`, { status: "push" });
  } else {
    await redis().hincrby(userKey, "pnl", -p.stake);
    await redis().hincrby(userKey, "picksLost", 1);
    await redis().hset(userKey, { streak: 0 });
    await redis().hset(`pick:${p.id}`, { status: "lost" });
  }
  await redis().srem("picks:open", p.id);
}

export interface SettleReport {
  checked: number;
  settled: number;
  matchesResolved: string[];
}

/** settle everything settleable. lock prevents stampedes. */
export async function settleAll(opts: { force?: boolean } = {}): Promise<SettleReport> {
  const report: SettleReport = { checked: 0, settled: 0, matchesResolved: [] };

  if (!opts.force) {
    const locked = await redis().set("settle:lock", "1", { nx: true, ex: 90 });
    if (!locked) return report; // someone settled recently — skip
  }

  const openIds = await redis().smembers("picks:open");
  if (openIds.length === 0) return report;

  const picks = (
    await Promise.all(openIds.map((id) => getPick(String(id))))
  ).filter((p): p is PickRecord => p !== null && p.status === "open");
  report.checked = picks.length;

  // group by match
  const byMatch = new Map<string, PickRecord[]>();
  for (const p of picks) {
    const arr = byMatch.get(p.matchId) ?? [];
    arr.push(p);
    byMatch.set(p.matchId, arr);
  }

  for (const [matchId, matchPicks] of byMatch) {
    // admin-forced result takes precedence (1x2 only), then txline
    const forced = await redis().get<string>(`match:${matchId}:result`);
    let result: MatchResult | null = null;
    if (forced === "home" || forced === "draw" || forced === "away") {
      // forced results carry no score — try to enrich with the real one
      const real = await fetchResult(matchId);
      result = {
        outcome: forced,
        totalGoals: real?.totalGoals ?? null,
        goalDiff: real?.goalDiff ?? null,
        htTotalGoals: real?.htTotalGoals ?? null,
      };
    } else {
      result = await fetchResult(matchId);
    }
    if (!result) continue;

    await redis().set(`match:${matchId}:result`, result.outcome, { ex: 7 * 86400 });
    let resolvedAny = false;
    for (const p of matchPicks) {
      const verdict = grade(p, result);
      if (!verdict) continue; // totals pick, no score yet
      await applyResult(p, verdict);
      report.settled++;
      resolvedAny = true;
    }
    if (resolvedAny) report.matchesResolved.push(`${matchId}:${result.outcome}`);
  }

  return report;
}
