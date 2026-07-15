import {
  getApiToken,
  openStream,
  parseSseData,
  readSseMessages,
  txGet,
} from "@/app/lib/server/txline-server";
import {
  normalizeFixture,
  normalizeOddsUpdate,
  normalizeScoreUpdate,
} from "@/app/lib/server/normalize";
import { record } from "@/app/lib/server/recorder";
import { resolveFollowedMatch } from "@/app/lib/server/droid";
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

      // droid filter: null = pass everything (browser / no target yet)
      let followMatchId: string | null = null;
      let followLabels: { home: string; away: string } | null = null;
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
              // team codes for the droid's score strip (events don't carry them)
              try {
                const raw = await txGet<Record<string, unknown>[]>("/api/fixtures/snapshot");
                const m = raw.map(normalizeFixture).find((f) => f && f.id === next);
                followLabels = m ? { home: m.home, away: m.away } : null;
              } catch {
                followLabels = null;
              }
            }
            followMatchId = next;
          } catch {
            /* keep the last known target */
          }
        };
        await refresh();
        const timer = setInterval(refresh, 60_000);
        request.signal.addEventListener("abort", () => clearInterval(timer));
      }

      const send = (e: MatchEvent) => {
        if (closed) return;
        if (followUser && followMatchId && e.matchId !== followMatchId) return;
        const out = followUser && followLabels ? { ...e, ...followLabels } : e;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(out)}\n\n`));
      };

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
          }
          if (!closed) await new Promise((r) => setTimeout(r, 3000)); // reconnect
        }
      };

      void pump("/api/odds/stream", "odds", (raw) => {
        const fixtureId = String(raw.FixtureId ?? raw.fixtureId ?? "");
        const event = normalizeOddsUpdate(raw, lastOdds.get(fixtureId));
        if (event?.odds) lastOdds.set(event.matchId, event.odds);
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
