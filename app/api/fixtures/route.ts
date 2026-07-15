import { NextResponse } from "next/server";
import { getApiToken, txGet } from "@/app/lib/server/txline-server";
import {
  extractSnapshotOdds,
  extractSnapshotTotals,
  normalizeFixture,
} from "@/app/lib/server/normalize";
import { redis } from "@/app/lib/server/db";
import type { Match } from "@/app/types";

/** stream-fed price memory (see /api/feed rememberPrices) — the fallback
 *  when txline's odds snapshots return empty for a priced match */
async function lastKnownPrices(m: Match): Promise<void> {
  try {
    const h = await redis().hgetall<Record<string, string>>(`match:${m.id}:lastOdds`);
    if (!h) return;
    const parse = <T,>(v: unknown): T | null => {
      if (v === undefined || v === null) return null;
      if (typeof v === "object") return v as T;
      try { return JSON.parse(String(v)) as T; } catch { return null; }
    };
    if (m.odds.home === 0) {
      const odds = parse<Match["odds"]>(h.odds);
      if (odds && odds.home > 0) m.odds = odds;
      const probs = parse<NonNullable<Match["probs"]>>(h.probs);
      if (probs) m.probs = probs;
    }
    if (!m.totals) {
      const totals = parse<NonNullable<Match["totals"]>>(h.totals);
      if (totals && totals.over > 1) m.totals = totals;
    }
  } catch {
    /* fallback only — never break fixtures */
  }
}

export const dynamic = "force-dynamic";

// warm-instance cache: fixtures + odds are refetched at most every 20s
let cached: { at: number; body: { live: boolean; matches: Match[] } } | null = null;

/** GET /api/fixtures — normalized fixtures from txline, with current
 *  1x2 odds pulled from the odds snapshot per fixture.
 *  returns { live: false } if no api token so the client falls back
 *  to replay mode without breaking. */
export async function GET() {
  if (!getApiToken()) {
    return NextResponse.json({ live: false, matches: [] });
  }
  if (cached && Date.now() - cached.at < 20_000) {
    return NextResponse.json(cached.body);
  }
  try {
    const raw = await txGet<Record<string, unknown>[]>("/api/fixtures/snapshot");
    const matches = raw
      .map(normalizeFixture)
      .filter((m): m is Match => m !== null)
      // soonest first, cap the list for the home screen
      .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc))
      .slice(0, 20);

    // attach current odds from the per-fixture snapshot (parallel, tolerant)
    await Promise.all(
      matches.map(async (m) => {
        try {
          const entries = await txGet<Record<string, unknown>[]>(
            `/api/odds/snapshot/${m.id}`
          );
          const dec = extractSnapshotOdds(entries);
          if (dec) {
            m.odds = dec.odds;
            if (dec.probs) m.probs = dec.probs;
          }
          const totals = extractSnapshotTotals(entries);
          if (totals) m.totals = totals;
        } catch {
          /* fixture without odds yet — leave zeros */
        }
        // snapshot empty? use the stream-fed memory
        if (m.odds.home === 0 || !m.totals) await lastKnownPrices(m);
      })
    );

    // bettable matches first, then by kickoff
    matches.sort((a, b) => {
      const aHas = a.odds.home > 0 ? 0 : 1;
      const bHas = b.odds.home > 0 ? 0 : 1;
      return aHas - bHas || a.kickoffUtc.localeCompare(b.kickoffUtc);
    });

    cached = { at: Date.now(), body: { live: true, matches } };
    return NextResponse.json(cached.body);
  } catch (err) {
    console.error("fixtures fetch failed:", err);
    return NextResponse.json({ live: false, matches: [] });
  }
}
