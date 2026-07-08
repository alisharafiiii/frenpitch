import { bus, ReplayEngine } from "./events";
import { recordedEvents } from "@/app/data/recorded-events";
import type { Match, MatchEvent } from "@/app/types";

/**
 * TxLineClient — feed switchboard for the browser.
 *
 *   live   → EventSource("/api/feed"): our server proxies + normalizes the
 *            real txline sse streams (api token never reaches the browser)
 *   replay → recorded events through ReplayEngine at 10x (demo mode,
 *            and the automatic fallback when there's no key / no live match)
 *   auto   → asks /api/fixtures; uses live if the key works, else replay
 */
export type FeedMode = "replay" | "live" | "auto";

export class TxLineClient {
  private replay?: ReplayEngine;
  private source?: EventSource;

  constructor(private mode: FeedMode = "auto", private speed = 10) {}

  /** returns fixtures when live, [] when replaying */
  async connect(): Promise<{ live: boolean; matches: Match[] }> {
    if (this.mode !== "replay") {
      try {
        const res = await fetch("/api/fixtures", { cache: "no-store" });
        const data = (await res.json()) as { live: boolean; matches: Match[] };
        if (data.live) {
          this.source = new EventSource("/api/feed");
          this.source.onmessage = (msg) => {
            try {
              bus.emit(JSON.parse(msg.data) as MatchEvent);
            } catch {
              /* skip malformed */
            }
          };
          return data;
        }
      } catch {
        /* fall through to replay */
      }
      if (this.mode === "live") throw new Error("live feed unavailable");
    }
    this.replay = new ReplayEngine(bus, recordedEvents, this.speed);
    this.replay.start();
    return { live: false, matches: [] };
  }

  disconnect(): void {
    this.replay?.stop();
    this.source?.close();
  }
}
