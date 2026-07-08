import type { MatchEvent } from "@/app/types";

type Listener = (e: MatchEvent) => void;

/** Tiny pub/sub bus. The mini app UI, pnl engine, and the droid
 *  bridge all subscribe here — one stream, many renderers. */
export class EventBus {
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(e: MatchEvent): void {
    this.listeners.forEach((fn) => fn(e));
  }
}

/**
 * ReplayEngine — the hackathon's secret weapon.
 *
 * Matches end before judging (July 19). We record real txline streams
 * during live games, then replay them at any speed so judges and the
 * demo video experience the app "live" at any time.
 *
 * Events carry a `t` ms offset; the engine schedules them relative to
 * start(), scaled by `speed` (10 = 10x faster than real time).
 */
export class ReplayEngine {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private startedAt = 0;

  constructor(
    private bus: EventBus,
    private events: MatchEvent[],
    private speed = 10
  ) {}

  start(): void {
    this.stop();
    this.startedAt = Date.now();
    const sorted = [...this.events].sort((a, b) => a.t - b.t);
    for (const e of sorted) {
      const delay = e.t / this.speed;
      this.timers.push(setTimeout(() => this.bus.emit(e), delay));
    }
  }

  stop(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  elapsedMs(): number {
    return (Date.now() - this.startedAt) * this.speed;
  }
}

/** Singleton bus for the client app */
export const bus = new EventBus();
