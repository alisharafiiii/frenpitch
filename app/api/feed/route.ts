import {
  getApiToken,
  openStream,
  parseSseData,
  readSseMessages,
  txGet,
} from "@/app/lib/server/txline-server";
import {
  extractSnapshotOdds,
  normalizeAhUpdate,
  normalizeFixture,
  normalizeOddsUpdate,
  normalizeScoreUpdate,
  normalizeTotalsUpdate,
} from "@/app/lib/server/normalize";
import { record } from "@/app/lib/server/recorder";
import { resolveFollowedMatch } from "@/app/lib/server/droid";
import { redis } from "@/app/lib/server/db";
import type { MatchEvent, Odds } from "@/app/types";

/** the stream is the source of truth when snapshots go empty (observed
 *  2026-07-15: all odds snapshots returned [] while the stream kept
 *  pricing) — remember every price so /api/fixtures can fall back. */
function rememberPrices(e: MatchEvent): void {
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
        } catch { prev = []; }
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

export const dynamic = "force-dynamic";

/** GET /api/feed — one merged SSE stream for the browser (and the droid).
 *  upstream odds + scores streams → record raw → normalize → forward.
 *  the txline api token stays server-side; clients only ever see this route.
 *
 *  ?user={tgId} — droid mode: filter to that user's followed match
 *  (pinned via /api/droid/follow, or auto = latest open pick). the filter
 *  re-resolves every 60s so retargeting from the app applies live, and
 *  the firmware stays dumb — it just renders whatever arrives. */
export async function GET(request: Request) {
  if (!getApiToken()) {
    return new Response("no api token — replay mode", { status: 503 });
  }

  const followUser = new URL(request.url).searchParams.get("user");

  const encoder = new TextEncoder();
  const lastOdds = new Map<string, Odds>(); // fixtureId → previous odds (for deltas)

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      };
      request.signal.addEventListener("abort", close);

      // sse comments: instant hello (defeats proxy buffering), 15s
      // keepalive, and upstream errors surfaced for curl-debugging —
      // EventSource clients ignore comment lines entirely
      const comment = (s: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ${s.replace(/\n/g, " ")}\n\n`));
        } catch {
          /* stream gone */
        }
      };
      comment("connected");
      const ka = setInterval(() => comment("ka"), 15000);
      request.signal.addEventListener("abort", () => clearInterval(ka));

      // droid filter: null = pass everything (browser / no target yet)
      let followMatchId: string | null = null;
      let followLabels: { home: string; away: string } | null = null;

      const send = (e: MatchEvent) => {
        if (closed) return;
        if (followUser && followMatchId && e.matchId !== followMatchId) return;
        const out = followUser && followLabels ? { ...e, ...followLabels } : e;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(out)}\n\n`));
      };

      if (followUser) {
        const refresh = async () => {
          try {
            // droid heartbeat — the me tab shows online while this ticks
            const { redis } = await import("@/app/lib/server/db");
            redis()
              .set(`droid:${followUser}:online`, Date.now(), { ex: 180 })
              .catch(() => {});
            const next = await resolveFollowedMatch(followUser);
            if (next && next !== followMatchId) {
              followMatchId = next;
              // team codes for the score strip (events don't carry them)
              try {
                const raw = await txGet<Record<string, unknown>[]>("/api/fixtures/snapshot");
                const m = raw.map(normalizeFixture).find((f) => f && f.id === next);
                followLabels = m ? { home: m.home, away: m.away } : null;
              } catch {
                followLabels = null;
              }
              // seed the CURRENT line from the same snapshot the home page
              // shows — otherwise the droid waits for the next move and can
              // sit on a stale/blank line that disagrees with the app
              try {
                const entries = await txGet<Record<string, unknown>[]>(
                  `/api/odds/snapshot/${next}`
                );
                let dec = extractSnapshotOdds(entries);
                if (!dec) {
                  // snapshot empty — stream-fed memory
                  const h = await redis().hgetall<Record<string, unknown>>(
                    `match:${next}:lastOdds`
                  );
                  const parse = <T,>(v: unknown): T | undefined => {
                    if (v === undefined || v === null) return undefined;
                    if (typeof v === "object") return v as T;
                    try { return JSON.parse(String(v)) as T; } catch { return undefined; }
                  };
                  const odds = parse<Odds>(h?.odds);
                  if (odds && odds.home > 0) {
                    dec = { odds, probs: parse<{ home: number; draw: number; away: number }>(h?.probs) };
                  }
                }
                if (dec) {
                  lastOdds.set(next, dec.odds);
                  send({
                    id: `seed-${next}-${Date.now()}`,
                    matchId: next,
                    t: Date.now(),
                    type: "odds_move",
                    minute: 0,
                    odds: dec.odds,
                    probs: dec.probs,
                  });
                }
              } catch {
                /* no line yet — droid shows "waiting for line" */
              }
            } else {
              followMatchId = next;
            }
          } catch {
            /* keep the last known target */
          }
        };
        await refresh();
        const timer = setInterval(refresh, 60_000);
        request.signal.addEventListener("abort", () => clearInterval(timer));
      }

      const pump = async (
        path: string,
        source: "odds" | "scores",
        normalize: (raw: Record<string, unknown>) => MatchEvent | null
      ) => {
        while (!closed) {
          try {
            const upstream = await openStream(path);
            for await (const msg of readSseMessages(upstream)) {
              if (closed) break;
              const data = parseSseData(msg.data);
              if (typeof data !== "object" || data === null) continue;
              const raw = data as Record<string, unknown>;
              record(source, raw);
              const event = normalize(raw);
              if (event) send(event);
            }
          } catch (err) {
            console.error(`${source} stream error:`, err);
            comment(`err ${source}: ${String(err).slice(0, 140)}`);
          }
          if (!closed) await new Promise((r) => setTimeout(r, 3000)); // reconnect
        }
      };

      void pump("/api/odds/stream", "odds", (raw) => {
        const fixtureId = String(raw.FixtureId ?? raw.fixtureId ?? "");
        // totals / handicap markets → market odds_move
        const totalsEvent = normalizeTotalsUpdate(raw);
        if (totalsEvent) {
          rememberPrices(totalsEvent);
          return totalsEvent;
        }
        const ahEvent = normalizeAhUpdate(raw);
        if (ahEvent) {
          rememberPrices(ahEvent);
          return ahEvent;
        }
        const event = normalizeOddsUpdate(raw, lastOdds.get(fixtureId));
        if (event?.odds) {
          lastOdds.set(event.matchId, event.odds);
          rememberPrices(event);
        }
        return event;
      });
      void pump("/api/scores/stream", "scores", normalizeScoreUpdate);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
