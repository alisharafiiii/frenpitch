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

/** soccer game-phase encoding (txodds spec):
 *  1=NS 2=H1 3=HT 4=H2 5=F 6=WET 7=ET1 8=HTET 9=ET2 10=FET
 *  11=WPE 12=PE 13=FPE 14=I 15=A 16=C */
const PHASE_EVENT: Record<string, MatchEvent["type"] | undefined> = {
  "2": "kickoff", H1: "kickoff",
  "3": "halftime", HT: "halftime",
  "4": "kickoff", H2: "kickoff",
  "5": "fulltime", F: "fulltime",
  "10": "fulltime", FET: "fulltime",
  "13": "fulltime", FPE: "fulltime",
};

/** stat key encoding: (period * 1000) + base_key
 *  base 1/2 = goals p1/p2 · 3/4 = yellows · 5/6 = reds · 7/8 = corners */
function statToEvent(key: number): { type: MatchEvent["type"]; team: "home" | "away" } | null {
  const base = key % 1000;
  const team: "home" | "away" = base % 2 === 1 ? "home" : "away";
  if (base === 1 || base === 2) return { type: "goal", team };
  if (base === 3 || base === 4) return { type: "card_yellow", team };
  if (base === 5 || base === 6) return { type: "card_red", team };
  return null; // corners etc — not surfaced in the stadium
}

/** scores stream payload → MatchEvent
 *  handles both phase changes (gameState) and stat updates (Key/Value or
 *  a Stats map, per the on-chain encoding). raw is always recorded, so
 *  unknown shapes can be re-normalized later. */
export function normalizeScoreUpdate(raw: Raw): MatchEvent | null {
  const fixtureId = pick<number | string>(raw, "FixtureId", "fixtureId");
  if (fixtureId === undefined) return null; // keepalive

  const minute = pick<number>(raw, "Minute", "minute", "MatchMinute") ?? 0;
  const base = {
    id: `score-${fixtureId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    matchId: String(fixtureId),
    t: Date.now(),
    minute,
    raw,
  };

  // 1. explicit stat update: { Key, Value } — goals/cards
  const statKey = pick<number>(raw, "Key", "key", "StatKey");
  if (statKey !== undefined) {
    const mapped = statToEvent(statKey);
    if (!mapped) return null;
    const value = pick<number>(raw, "Value", "value");
    return {
      ...base,
      type: mapped.type,
      team: mapped.team,
      ...(mapped.type === "goal" && value !== undefined
        ? mapped.team === "home"
          ? { scoreHome: value }
          : { scoreAway: value }
        : {}),
    };
  }

  // 2. stats map: { Stats: { "1": 2, "2": 1, ... } } — emit current score
  const stats = pick<Record<string, number>>(raw, "Stats", "stats");
  if (stats && (stats["1"] !== undefined || stats["2"] !== undefined)) {
    return {
      ...base,
      type: "goal",
      scoreHome: stats["1"] ?? 0,
      scoreAway: stats["2"] ?? 0,
    };
  }

  // 3. phase change: { GameState: 3 | "HT" | ... }
  const phase = pick<string | number>(raw, "GameState", "gameState", "GamePhase");
  if (phase !== undefined && phase !== null) {
    const type = PHASE_EVENT[String(phase).toUpperCase()];
    if (type) return { ...base, type };
  }

  return null;
}
