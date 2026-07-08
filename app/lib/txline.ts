import { bus, ReplayEngine } from "./events";
import { recordedEvents } from "@/app/data/recorded-events";

/**
 * TxLineClient — swap point between mock replay and the real feed.
 *
 * Real integration (fill in during days 1-2):
 *   quickstart: https://txline.txodds.com/documentation/quickstart
 *   worldcup docs: https://txline.txodds.com/documentation/worldcup
 *
 * 1. Sign up through Solana per hackathon rules, grab API key.
 * 2. Open the websocket / SSE stream for subscribed matches.
 * 3. Normalize incoming payloads into `MatchEvent` (app/types) —
 *    everything downstream (UI, settler, droid) already speaks it.
 * 4. RECORD every raw payload to disk. Recorded streams feed the
 *    ReplayEngine for the demo video and post-tournament judging.
 */
export type FeedMode = "replay" | "live";

export class TxLineClient {
  private replay?: ReplayEngine;

  constructor(private mode: FeedMode = "replay", private speed = 10) {}

  connect(): void {
    if (this.mode === "replay") {
      this.replay = new ReplayEngine(bus, recordedEvents, this.speed);
      this.replay.start();
      return;
    }
    // TODO(live): open real txline stream, normalize, bus.emit(event)
    throw new Error("live mode not wired yet — add API key + ws url");
  }

  disconnect(): void {
    this.replay?.stop();
  }
}
