import { redis } from "./db";
import type { MatchEvent } from "@/app/types";

/** stream-fed price memory — the source of truth when txline's
 *  snapshots go empty (observed 2026-07-15: snapshots returned [] and
 *  omitted whole markets while the stream kept pricing). every price
 *  seen on the stream is remembered so /api/fixtures can fall back. */
export function rememberPrices(e: MatchEvent): void {
  void (async () => {
    try {
      const key = `match:${e.matchId}:lastOdds`;
      const patch: Record<string, string> = {};
      if (e.odds) patch.odds = JSON.stringify(e.odds);
      if (e.probs) patch.probs = JSON.stringify(e.probs);
      if (e.totals) patch.totals = JSON.stringify(e.totals);
      if (e.totals1h) patch.totals1h = JSON.stringify(e.totals1h);
      if (e.ah && e.ah.length > 0) {
        // merge the updated line into the remembered set (max 3, balanced first)
        const prevRaw = await redis().hget<unknown>(key, "ah");
        let prev: { line: number; home: number; away: number }[] = [];
        try {
          prev = typeof prevRaw === "string" ? JSON.parse(prevRaw) : ((prevRaw as typeof prev) ?? []);
        } catch {
          prev = [];
        }
        const merged = new Map(prev.map((l) => [l.line, l]));
        for (const l of e.ah) merged.set(l.line, l);
        patch.ah = JSON.stringify(
          [...merged.values()]
            .sort((a, b) => Math.abs(a.home - a.away) - Math.abs(b.home - b.away))
            .slice(0, 3)
        );
      }
      if (Object.keys(patch).length === 0) return;
      patch.ts = String(Date.now());
      await redis().hset(key, patch);
      await redis().expire(key, 12 * 3600);
    } catch {
      /* memory is best-effort */
    }
  })();
}
