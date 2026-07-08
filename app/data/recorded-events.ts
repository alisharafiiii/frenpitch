import type { MatchEvent } from "@/app/types";

/** A ~90s demo slice of a recorded stream (BRA vs FRA), `t` in ms.
 *  During the world cup: record REAL txline payloads, normalize them
 *  into this shape, and drop them here (or load from json). The whole
 *  app + droid then replays reality on demand. */
export const recordedEvents: MatchEvent[] = [
  { id: "e1", matchId: "m1", t: 2000, type: "odds_move", minute: 64, outcome: "home", delta: 0.05, odds: { home: 2.15, draw: 3.4, away: 3.8 } },
  { id: "e2", matchId: "m1", t: 8000, type: "var_check", minute: 65 },
  { id: "e3", matchId: "m1", t: 15000, type: "penalty_awarded", team: "home", minute: 66 },
  { id: "e4", matchId: "m1", t: 19000, type: "odds_move", minute: 66, outcome: "home", delta: -0.45, odds: { home: 1.7, draw: 3.6, away: 4.4 } },
  { id: "e5", matchId: "m1", t: 26000, type: "goal", team: "home", player: "estevão", minute: 67, scoreHome: 2, scoreAway: 1 },
  { id: "e6", matchId: "m1", t: 28000, type: "odds_move", minute: 67, outcome: "home", delta: -0.35, odds: { home: 1.35, draw: 4.8, away: 7.2 } },
  { id: "e7", matchId: "m1", t: 40000, type: "card_yellow", team: "away", player: "tchouaméni", minute: 70 },
  { id: "e8", matchId: "m1", t: 52000, type: "odds_move", minute: 74, outcome: "away", delta: 0.6, odds: { home: 1.3, draw: 5.0, away: 7.8 } },
  { id: "e9", matchId: "m1", t: 64000, type: "card_red", team: "away", player: "hernández", minute: 78 },
  { id: "e10", matchId: "m1", t: 70000, type: "odds_move", minute: 79, outcome: "home", delta: -0.1, odds: { home: 1.2, draw: 5.6, away: 9.5 } },
  { id: "e11", matchId: "m1", t: 82000, type: "goal", team: "away", player: "mbappé", minute: 84, scoreHome: 2, scoreAway: 2 },
  { id: "e12", matchId: "m1", t: 84000, type: "odds_move", minute: 84, outcome: "draw", delta: -1.4, odds: { home: 1.9, draw: 2.6, away: 4.1 } },
  { id: "e13", matchId: "m1", t: 90000, type: "fulltime", minute: 90, scoreHome: 2, scoreAway: 2 },
];
