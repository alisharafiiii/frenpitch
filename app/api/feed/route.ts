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
import { rememberPrices } from "@/app/lib/server/prices";
import type { MatchEvent, Odds } from "@/app/types";

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
  const lastMinute = new Map<string, number>(); // fixtureId → live match clock (from scores noise)

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
        // strip the raw upstream payload — live score entries carry a huge
        // Stats blob that overflows the droid's 4KB SSE line buffer (events
        // silently dropped). raw is already persisted by the recorder.
        const { raw: _raw, ...lean } = e as MatchEvent & { raw?: unknown };
        // odds events carry minute 0 (their stream has no clock) — stamp the
        // real minute remembered from the scores stream so timers stay live
        const known = lastMinute.get(lean.matchId);
        if (known !== undefined && known > (lean.minute ?? 0)) lean.minute = known;
        const out = followUser && followLabels ? { ...lean, ...followLabels } : lean;
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
              // seed match STATE — a droid connecting mid-game otherwise
              // shows "upcoming" until the next goal/card flips it live
              try {
                const entries = await txGet<Record<string, unknown>[]>(
                  `/api/scores/snapshot/${next}`
                );
                const byTs = [...entries].sort(
                  (a, b) => Number(b.Ts ?? 0) - Number(a.Ts ?? 0)
                );
                const latestStatus = Number(
                  byTs.find((e2) => e2.StatusId !== undefined)?.StatusId ?? -1
                );
                const withScore = byTs.find((e2) => {
                  const st = e2.Stats as Record<string, number> | undefined;
                  return st && st["1"] !== undefined;
                });
                const st = withScore?.Stats as Record<string, number> | undefined;
                const withClock = byTs.find((e2) => {
                  const c = e2.Clock as { Seconds?: number } | undefined;
                  return typeof c?.Seconds === "number";
                });
                const ck = withClock?.Clock as { Seconds?: number } | undefined;
                if (typeof ck?.Seconds === "number") {
                  lastMinute.set(next, Math.min(120, Math.round(ck.Seconds / 60)));
                }
                if (latestStatus === 2 || latestStatus === 3 || latestStatus === 4) {
                  send({
                    id: `state-${next}-${Date.now()}`,
                    matchId: next,
                    t: Date.now(),
                    type: "kickoff",
                    minute: lastMinute.get(next) ?? 0,
                    ...(st ? { scoreHome: Number(st["1"]), scoreAway: Number(st["2"] ?? 0) } : {}),
                  });
                }
              } catch {
                /* state seed is best-effort */
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
      void pump("/api/scores/stream", "scores", (raw) => {
        const clock = raw.Clock as { Seconds?: number } | undefined;
        const fid = String(raw.FixtureId ?? "");
        if (fid && typeof clock?.Seconds === "number") {
          lastMinute.set(fid, Math.min(120, Math.round(clock.Seconds / 60)));
        }
        return normalizeScoreUpdate(raw);
      });
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
