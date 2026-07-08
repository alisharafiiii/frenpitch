import {
  getApiToken,
  openStream,
  parseSseData,
  readSseMessages,
} from "@/app/lib/server/txline-server";
import {
  normalizeOddsUpdate,
  normalizeScoreUpdate,
} from "@/app/lib/server/normalize";
import { record } from "@/app/lib/server/recorder";
import type { MatchEvent, Odds } from "@/app/types";

export const dynamic = "force-dynamic";

/** GET /api/feed — one merged SSE stream for the browser (and the droid).
 *  upstream odds + scores streams → record raw → normalize → forward.
 *  the txline api token stays server-side; clients only ever see this route. */
export async function GET(request: Request) {
  if (!getApiToken()) {
    return new Response("no api token — replay mode", { status: 503 });
  }

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

      const send = (e: MatchEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
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
