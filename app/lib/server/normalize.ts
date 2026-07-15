import type { Match, MatchEvent, Odds } from "@/app/types";

/** tolerant normalizer: txline payload → our one MatchEvent/Match shape.
 *
 *  field names are best-effort from the docs (fixtures are documented;
 *  odds/scores update shapes get confirmed with `npm run probe` against
 *  the live feed — adjust the key lookups below if probe shows different
 *  names. every raw payload is also recorded untouched, so nothing is
 *  ever lost while we tune this.) */

type Raw = Record<string, unknown>;

function pick<T>(obj: Raw, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T;
  }
  return undefined;
}

// team → { emoji fallback, iso code for circle-flag svgs }
const COUNTRIES: Record<string, { e: string; iso: string }> = {
  brazil: { e: "🇧🇷", iso: "br" }, france: { e: "🇫🇷", iso: "fr" },
  argentina: { e: "🇦🇷", iso: "ar" }, mexico: { e: "🇲🇽", iso: "mx" },
  england: { e: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", iso: "gb-eng" }, ghana: { e: "🇬🇭", iso: "gh" },
  germany: { e: "🇩🇪", iso: "de" }, spain: { e: "🇪🇸", iso: "es" },
  portugal: { e: "🇵🇹", iso: "pt" }, netherlands: { e: "🇳🇱", iso: "nl" },
  italy: { e: "🇮🇹", iso: "it" }, belgium: { e: "🇧🇪", iso: "be" },
  croatia: { e: "🇭🇷", iso: "hr" }, morocco: { e: "🇲🇦", iso: "ma" },
  japan: { e: "🇯🇵", iso: "jp" }, "south korea": { e: "🇰🇷", iso: "kr" },
  usa: { e: "🇺🇸", iso: "us" }, "united states": { e: "🇺🇸", iso: "us" },
  canada: { e: "🇨🇦", iso: "ca" }, uruguay: { e: "🇺🇾", iso: "uy" },
  colombia: { e: "🇨🇴", iso: "co" }, senegal: { e: "🇸🇳", iso: "sn" },
  nigeria: { e: "🇳🇬", iso: "ng" }, australia: { e: "🇦🇺", iso: "au" },
  switzerland: { e: "🇨🇭", iso: "ch" }, poland: { e: "🇵🇱", iso: "pl" },
  denmark: { e: "🇩🇰", iso: "dk" }, ecuador: { e: "🇪🇨", iso: "ec" },
  qatar: { e: "🇶🇦", iso: "qa" }, "saudi arabia": { e: "🇸🇦", iso: "sa" },
  iran: { e: "🇮🇷", iso: "ir" }, wales: { e: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", iso: "gb-wls" },
  scotland: { e: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", iso: "gb-sct" }, cameroon: { e: "🇨🇲", iso: "cm" },
  serbia: { e: "🇷🇸", iso: "rs" }, tunisia: { e: "🇹🇳", iso: "tn" },
  "costa rica": { e: "🇨🇷", iso: "cr" }, norway: { e: "🇳🇴", iso: "no" },
  sweden: { e: "🇸🇪", iso: "se" }, austria: { e: "🇦🇹", iso: "at" },
  ukraine: { e: "🇺🇦", iso: "ua" }, turkey: { e: "🇹🇷", iso: "tr" },
  egypt: { e: "🇪🇬", iso: "eg" }, "ivory coast": { e: "🇨🇮", iso: "ci" },
  algeria: { e: "🇩🇿", iso: "dz" }, paraguay: { e: "🇵🇾", iso: "py" },
  chile: { e: "🇨🇱", iso: "cl" }, peru: { e: "🇵🇪", iso: "pe" },
  panama: { e: "🇵🇦", iso: "pa" }, jordan: { e: "🇯🇴", iso: "jo" },
  uzbekistan: { e: "🇺🇿", iso: "uz" }, "new zealand": { e: "🇳🇿", iso: "nz" },
  vietnam: { e: "🇻🇳", iso: "vn" }, myanmar: { e: "🇲🇲", iso: "mm" },
  india: { e: "🇮🇳", iso: "in" }, pakistan: { e: "🇵🇰", iso: "pk" },
  bangladesh: { e: "🇧🇩", iso: "bd" }, "sri lanka": { e: "🇱🇰", iso: "lk" },
  china: { e: "🇨🇳", iso: "cn" }, thailand: { e: "🇹🇭", iso: "th" },
  indonesia: { e: "🇮🇩", iso: "id" }, malaysia: { e: "🇲🇾", iso: "my" },
  philippines: { e: "🇵🇭", iso: "ph" }, "south africa": { e: "🇿🇦", iso: "za" },
  greece: { e: "🇬🇷", iso: "gr" }, "czech republic": { e: "🇨🇿", iso: "cz" },
  czechia: { e: "🇨🇿", iso: "cz" }, romania: { e: "🇷🇴", iso: "ro" },
  hungary: { e: "🇭🇺", iso: "hu" }, slovakia: { e: "🇸🇰", iso: "sk" },
  slovenia: { e: "🇸🇮", iso: "si" }, ireland: { e: "🇮🇪", iso: "ie" },
  finland: { e: "🇫🇮", iso: "fi" }, iceland: { e: "🇮🇸", iso: "is" },
  albania: { e: "🇦🇱", iso: "al" }, georgia: { e: "🇬🇪", iso: "ge" },
  venezuela: { e: "🇻🇪", iso: "ve" }, bolivia: { e: "🇧🇴", iso: "bo" },
  honduras: { e: "🇭🇳", iso: "hn" }, jamaica: { e: "🇯🇲", iso: "jm" },
  mali: { e: "🇲🇱", iso: "ml" }, "burkina faso": { e: "🇧🇫", iso: "bf" },
  "dr congo": { e: "🇨🇩", iso: "cd" }, kenya: { e: "🇰🇪", iso: "ke" },
  "united arab emirates": { e: "🇦🇪", iso: "ae" }, iraq: { e: "🇮🇶", iso: "iq" },
  oman: { e: "🇴🇲", iso: "om" }, bahrain: { e: "🇧🇭", iso: "bh" },
  kuwait: { e: "🇰🇼", iso: "kw" }, lebanon: { e: "🇱🇧", iso: "lb" },
};

export function flagFor(team: string): string {
  return COUNTRIES[team.toLowerCase().trim()]?.e ?? "⚽";
}

export function isoFor(team: string): string | undefined {
  return COUNTRIES[team.toLowerCase().trim()]?.iso;
}

/** fixtures snapshot entry → Match (documented shape) */
export function normalizeFixture(raw: Raw): Match | null {
  const fixtureId = pick<number | string>(raw, "FixtureId", "fixtureId", "id");
  const p1 = pick<string>(raw, "Participant1", "participant1");
  const p2 = pick<string>(raw, "Participant2", "participant2");
  if (fixtureId === undefined || !p1 || !p2) return null;

  const p1Home = pick<boolean>(raw, "Participant1IsHome", "participant1IsHome") ?? true;
  const home = p1Home ? p1 : p2;
  const away = p1Home ? p2 : p1;
  const startRaw = pick<number | string>(raw, "StartTime", "startTime");
  const kickoff = startRaw !== undefined ? new Date(startRaw).toISOString() : new Date().toISOString();

  return {
    id: String(fixtureId),
    home: home.slice(0, 3).toUpperCase(),
    away: away.slice(0, 3).toUpperCase(),
    homeFlag: flagFor(home),
    awayFlag: flagFor(away),
    homeIso: isoFor(home),
    awayIso: isoFor(away),
    kickoffUtc: kickoff,
    status: "upcoming",
    minute: 0,
    scoreHome: 0,
    scoreAway: 0,
    odds: { home: 0, draw: 0, away: 0 },
    oddsDelta: {},
  };
}

/** odds stream payload → MatchEvent
 *  real shape (confirmed by probe 2026-07-07):
 *  { FixtureId, Ts, SuperOddsType: "1X2_PARTICIPANT_RESULT",
 *    MarketPeriod: "half=1" | null, PriceNames: ["part1","draw","part2"],
 *    Prices: [4929, 2405, 2622] }  ← thousandths: 4929 = 4.929
 *  keepalives are bare { Ts } → return null. */
function isFullMatchPeriod(period: string | undefined): boolean {
  return !period || period.toLowerCase().includes("full");
}

interface Decoded1x2 {
  odds: Odds;
  probs?: { home: number; draw: number; away: number };
}

/** decode a 1x2 market entry: Prices in thousandths + Pct = market-implied
 *  win probabilities (demargined, straight from txline) */
function decode1x2(raw: Raw): Decoded1x2 | null {
  const oddsType = pick<string>(raw, "SuperOddsType");
  if (!oddsType || !oddsType.includes("1X2")) return null;

  const names = pick<string[]>(raw, "PriceNames");
  const prices = pick<number[]>(raw, "Prices");
  if (!names || !prices || names.length !== prices.length) return null;

  const idx = (label: string): number =>
    names.findIndex((n) => n.toLowerCase() === label);
  const iH = idx("part1");
  const iD = idx("draw");
  const iA = idx("part2");
  if (iH < 0 || iD < 0 || iA < 0) return null;

  const odds: Odds = {
    home: prices[iH] / 1000,
    draw: prices[iD] / 1000,
    away: prices[iA] / 1000,
  };

  let probs: Decoded1x2["probs"];
  const pct = pick<(string | number)[]>(raw, "Pct");
  if (pct && pct.length === names.length) {
    probs = {
      home: Math.round(Number(pct[iH])),
      draw: Math.round(Number(pct[iD])),
      away: Math.round(Number(pct[iA])),
    };
  }
  return { odds, probs };
}

/** odds snapshot (array of market entries) → current full-match 1x2.
 *  prefers full-match markets, falls back to any 1x2; latest Ts wins. */
export function extractSnapshotOdds(entries: Raw[]): Decoded1x2 | null {
  if (!Array.isArray(entries)) return null;
  const candidates = entries
    .map((e) => ({ e, dec: decode1x2(e) }))
    .filter((c): c is { e: Raw; dec: Decoded1x2 } => c.dec !== null)
    .sort((a, b) => (pick<number>(b.e, "Ts") ?? 0) - (pick<number>(a.e, "Ts") ?? 0));
  if (candidates.length === 0) return null;
  const full = candidates.find((c) =>
    isFullMatchPeriod(pick<string>(c.e, "MarketPeriod"))
  );
  return (full ?? candidates[0]).dec;
}

/** over/under total-goals from the odds snapshot.
 *  entries: SuperOddsType OVERUNDER_PARTICIPANT_GOALS,
 *  MarketParameters "line=1.5", PriceNames ["over","under"].
 *  quarter lines (x.25 / x.75) carry half-win semantics — skipped so
 *  settlement stays honest: .5 lines never push, whole lines push. */
export interface TotalsMarket {
  line: number;
  over: number;
  under: number;
  overPct?: number;
  underPct?: number;
}

export function extractSnapshotTotals(entries: Raw[]): TotalsMarket | null {
  if (!Array.isArray(entries)) return null;
  const candidates: (TotalsMarket & { ts: number })[] = [];
  for (const e of entries) {
    const t = pick<string>(e, "SuperOddsType");
    if (!t || !t.includes("OVERUNDER")) continue;
    if (!isFullMatchPeriod(pick<string>(e, "MarketPeriod"))) continue;
    const params = String(pick<string>(e, "MarketParameters") ?? "");
    const m = params.match(/line=([\d.]+)/);
    if (!m) continue;
    const line = Number(m[1]);
    const quarter = Math.abs((line * 4) % 2) === 1; // .25 / .75 → skip
    if (quarter) continue;
    const names = (pick<string[]>(e, "PriceNames") ?? []).map((n) => String(n).toLowerCase());
    const prices = pick<number[]>(e, "Prices") ?? [];
    const iO = names.indexOf("over");
    const iU = names.indexOf("under");
    if (iO < 0 || iU < 0 || !prices[iO] || !prices[iU]) continue;
    const pct = pick<(number | string)[]>(e, "Pct");
    candidates.push({
      line,
      over: prices[iO] / 1000,
      under: prices[iU] / 1000,
      ...(pct && pct[iO] !== undefined
        ? { overPct: Math.round(Number(pct[iO])), underPct: Math.round(Number(pct[iU])) }
        : {}),
      ts: pick<number>(e, "Ts") ?? 0,
    });
  }
  if (candidates.length === 0) return null;
  // freshest per line, then the most balanced market (closest to even)
  const byLine = new Map<number, TotalsMarket & { ts: number }>();
  for (const c of candidates) {
    const cur = byLine.get(c.line);
    if (!cur || c.ts > cur.ts) byLine.set(c.line, c);
  }
  const best = [...byLine.values()].sort(
    (a, b) => Math.abs(a.over - a.under) - Math.abs(b.over - b.under)
  )[0];
  const { ts: _ts, ...market } = best;
  return market;
}

/** totals (over/under) stream update → odds_move event carrying totals.
 *  clean lines only, same rule as the snapshot extractor. */
export function normalizeTotalsUpdate(raw: Raw): MatchEvent | null {
  const fixtureId = pick<number | string>(raw, "FixtureId", "fixtureId");
  if (fixtureId === undefined) return null;
  const t = pick<string>(raw, "SuperOddsType");
  if (!t || !t.includes("OVERUNDER")) return null;
  if (!isFullMatchPeriod(pick<string>(raw, "MarketPeriod"))) return null;
  const m = String(pick<string>(raw, "MarketParameters") ?? "").match(/line=([\d.]+)/);
  if (!m) return null;
  const line = Number(m[1]);
  if (Math.abs((line * 4) % 2) === 1) return null; // quarter lines skipped
  const names = (pick<string[]>(raw, "PriceNames") ?? []).map((n) => String(n).toLowerCase());
  const prices = pick<number[]>(raw, "Prices") ?? [];
  const iO = names.indexOf("over");
  const iU = names.indexOf("under");
  if (iO < 0 || iU < 0 || !prices[iO] || !prices[iU]) return null;
  const pct = pick<(number | string)[]>(raw, "Pct");
  return {
    id: `totals-${fixtureId}-${Date.now()}`,
    matchId: String(fixtureId),
    t: Date.now(),
    type: "odds_move",
    minute: pick<number>(raw, "Minute", "minute") ?? 0,
    totals: {
      line,
      over: prices[iO] / 1000,
      under: prices[iU] / 1000,
      ...(pct && pct[iO] !== undefined
        ? { overPct: Math.round(Number(pct[iO])), underPct: Math.round(Number(pct[iU])) }
        : {}),
    },
    raw,
  };
}

export function normalizeOddsUpdate(raw: Raw, prev?: Odds): MatchEvent | null {
  const fixtureId = pick<number | string>(raw, "FixtureId", "fixtureId");
  if (fixtureId === undefined) return null; // keepalive

  // full-match market only (half markets skipped)
  if (!isFullMatchPeriod(pick<string>(raw, "MarketPeriod"))) return null;

  const dec = decode1x2(raw);
  if (!dec) return null;
  const { odds, probs } = dec;
  const { home, draw, away } = odds;

  // biggest mover vs previous snapshot
  let outcome: MatchEvent["outcome"];
  let delta: number | undefined;
  if (prev) {
    const moves: [MatchEvent["outcome"], number][] = [
      ["home", home - prev.home],
      ["draw", draw - prev.draw],
      ["away", away - prev.away],
    ];
    moves.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    if (Math.abs(moves[0][1]) > 0.001) {
      outcome = moves[0][0];
      delta = Number(moves[0][1].toFixed(2));
    }
  }

  return {
    id: `odds-${fixtureId}-${Date.now()}`,
    matchId: String(fixtureId),
    t: Date.now(),
    type: "odds_move",
    minute: pick<number>(raw, "Minute", "minute") ?? 0,
    odds,
    probs,
    outcome,
    delta,
    raw,
  };
}

/* soccer game-phase encoding (txodds spec):
 * 1=NS 2=H1 3=HT 4=H2 5=F 6=WET 7=ET1 8=HTET 9=ET2 10=FET
 * 11=WPE 12=PE 13=FPE 14=I 15=A 16=C · observed live: 100=finalised */

/** scores stream payload → MatchEvent.
 *  verified against real feed (NOR-ENG 2026-07-11): events carry
 *  { Action: "goal" | "yellow_card" | "var" | "game_finalised" | ...,
 *    StatusId: phase id (100 = finalised), Stats: { "1": goals p1, ... },
 *    Clock: { Seconds }, Participant: 1 | 2 } */
export function normalizeScoreUpdate(raw: Raw): MatchEvent | null {
  const fixtureId = pick<number | string>(raw, "FixtureId", "fixtureId");
  if (fixtureId === undefined) return null; // keepalive

  const stats = pick<Record<string, number>>(raw, "Stats", "stats");
  const clock = pick<{ Seconds?: number }>(raw, "Clock");
  const minute = clock?.Seconds
    ? Math.min(120, Math.round(clock.Seconds / 60))
    : (pick<number>(raw, "Minute", "minute") ?? 0);

  const base = {
    id: `score-${fixtureId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    matchId: String(fixtureId),
    t: Date.now(),
    minute,
    ...(stats && stats["1"] !== undefined
      ? { scoreHome: Number(stats["1"]), scoreAway: Number(stats["2"] ?? 0) }
      : {}),
    raw,
  };

  const action = String(pick<string>(raw, "Action") ?? "").toLowerCase();
  const status = Number(pick<number | string>(raw, "StatusId") ?? -1);
  const participant = Number(pick<number>(raw, "Participant") ?? 0);
  const team = participant === 2 ? ("away" as const) : ("home" as const);

  if (action.includes("goal") && !action.includes("kick")) {
    return { ...base, type: "goal", team };
  }
  if (action.includes("red_card")) return { ...base, type: "card_red", team };
  if (action.includes("yellow_card")) return { ...base, type: "card_yellow", team };
  if (action.includes("var")) return { ...base, type: "var_check" };
  if (action.includes("penalty_awarded")) return { ...base, type: "penalty_awarded", team };
  if (
    action === "game_finalised" ||
    action === "match_ended" ||
    status === 100 ||
    status === 5 ||
    status === 10 ||
    status === 13
  ) {
    return { ...base, type: "fulltime" };
  }
  if (status === 3) return { ...base, type: "halftime" };
  if (action === "kick_off" || status === 2 || status === 4) {
    return { ...base, type: "kickoff" };
  }

  // possession / throw-in noise — no ui event, but score corrections
  // still flow through when Stats changed (handled via goal above)
  return null;
}
