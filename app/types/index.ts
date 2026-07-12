// ---------- txline / match data ----------

export type Outcome = "home" | "draw" | "away";

export interface Odds {
  home: number;
  draw: number;
  away: number;
}

/** market-implied win probabilities (%) — from txline's Pct field */
export interface Probs {
  home: number;
  draw: number;
  away: number;
}

export interface Match {
  id: string;
  home: string; // team code e.g. "BRA"
  away: string;
  homeFlag: string; // emoji fallback
  awayFlag: string;
  /** iso code for circle-flag svg (e.g. "fr", "gb-eng") */
  homeIso?: string;
  awayIso?: string;
  kickoffUtc: string; // ISO
  status: "upcoming" | "live" | "ht" | "ft";
  minute: number;
  scoreHome: number;
  scoreAway: number;
  odds: Odds;
  oddsDelta: Partial<Record<Outcome, number>>; // move over last window
  probs?: Probs;
}

/** Normalized event object — the ONE shape every client consumes:
 *  mini app, backend settler, and the stackchan droid. */
export interface MatchEvent {
  id: string;
  matchId: string;
  /** ms offset from stream start (replay) or epoch ms (live) */
  t: number;
  type:
    | "kickoff"
    | "goal"
    | "own_goal"
    | "penalty_awarded"
    | "card_yellow"
    | "card_red"
    | "var_check"
    | "odds_move"
    | "halftime"
    | "fulltime";
  team?: "home" | "away";
  player?: string;
  minute: number;
  scoreHome?: number;
  scoreAway?: number;
  /** team codes — attached server-side for droid clients */
  home?: string;
  away?: string;
  odds?: Odds;
  probs?: Probs;
  /** for odds_move: which outcome moved and by how much */
  outcome?: Outcome;
  delta?: number;
  /** untouched upstream payload (live mode) — for debugging + re-normalizing */
  raw?: unknown;
}

// ---------- frens / picks ----------

export interface Fren {
  id: string;
  handle: string;
  initial: string;
  photoUrl?: string;
  gradient: [string, string];
  /** matchday pnl in points */
  pnl: number;
  streak: number;
  online: boolean;
  /** position on the pitch, percent coords */
  x: number;
  y: number;
  livePick?: Pick;
  lastPick?: Pick;
}

export interface Pick {
  id: string;
  matchId: string;
  matchLabel: string;
  outcome: Outcome;
  outcomeLabel: string;
  lockedOdds: number;
  currentOdds: number;
  stake: number; // points
  status: "upcoming" | "live" | "won" | "lost";
  livePnl: number;
}

// ---------- tournaments ----------

export type PrizeSplit = "winner_take_all" | "split_70_20_10" | "even_top3";

export interface Tournament {
  id: string;
  name: string;
  buyInUsdc: number;
  split: PrizeSplit;
  creatorId: string;
  participants: string[]; // fren ids
  maxFrens: number;
  deadlineUtc: string;
  /** base58 of the onchain escrow PDA (devnet) */
  escrowPda?: string;
  passcode: string;
  status: "open" | "live" | "settled" | "refunded";
}

// ---------- quiz ----------

export interface QuizQuestion {
  id: string;
  text: string;
  answers: [string, string, string, string];
  correctIndex: number;
  seconds: number;
}

export interface QuizPlayer {
  frenId: string;
  score: number;
  answeredMs?: number;
}

export interface QuizMatchState {
  id: string;
  players: QuizPlayer[];
  questionIndex: number;
  totalQuestions: number;
  phase: "lobby" | "question" | "reveal" | "final";
}

// ---------- droid ----------

/** Everything the stackchan needs is derived from MatchEvent +
 *  these app-level social events. See docs/droid-spec.md */
export interface SocialEvent {
  id: string;
  t: number;
  type: "fren_pick_locked" | "fren_streak" | "tournament_lead_change" | "quiz_started";
  frenHandle?: string;
  detail: string;
}

export type DroidEvent =
  | { kind: "match"; event: MatchEvent }
  | { kind: "social"; event: SocialEvent };
