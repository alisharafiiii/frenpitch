"use client";

import type { Match, Outcome } from "@/app/types";
import ui from "@/app/styles/ui.module.css";
import styles from "./odds.module.css";

const outcomeLabel: Record<Outcome, (m: Match) => string> = {
  home: (m) => m.home.toLowerCase(),
  draw: () => "draw",
  away: (m) => m.away.toLowerCase(),
};

export function OddsCard({
  match,
  onPick,
  index = 0,
}: {
  match: Match;
  onPick: (m: Match, o: Outcome) => void;
  index?: number;
}) {
  const outcomes: Outcome[] = ["home", "draw", "away"];
  return (
    <div
      className={`${ui.card} ${styles.oddsCard}`}
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      <div className={styles.top}>
        <div className={styles.matchName}>
          {match.homeFlag} {match.home.toLowerCase()}
          {match.status !== "upcoming" && (
            <b className={ui.num}>
              &nbsp;{match.scoreHome}–{match.scoreAway}&nbsp;
            </b>
          )}
          {match.status === "upcoming" && <span>&nbsp;vs&nbsp;</span>}
          {match.away.toLowerCase()} {match.awayFlag}
        </div>
        {match.status === "live" || match.status === "ht" ? (
          <span className={ui.pillLive}>
            <span className={ui.liveDot} />
            {match.status === "ht" ? "HT" : `LIVE ${match.minute}'`}
          </span>
        ) : match.status === "ft" ? (
          <span className={ui.pillSoon}>FT</span>
        ) : (
          <span className={ui.pillSoon}>
            {new Date(match.kickoffUtc).toISOString().slice(11, 16)} UTC
          </span>
        )}
      </div>
      <div className={styles.row}>
        {outcomes.map((o) => {
          const delta = match.oddsDelta[o];
          const noOdds = match.odds[o] === 0;
          return (
            <button
              key={o}
              className={styles.oddsBtn}
              disabled={noOdds}
              style={noOdds ? { opacity: 0.45 } : undefined}
              onClick={() => onPick(match, o)}
            >
              <div className={styles.lbl}>{outcomeLabel[o](match)}</div>
              <div className={`${styles.val} ${ui.num}`}>
                {noOdds ? "soon" : match.odds[o].toFixed(2)}
              </div>
              <div
                className={`${styles.delta} ${
                  delta && delta > 0 ? ui.pos : delta && delta < 0 ? ui.neg : styles.flat
                }`}
              >
                {delta ? (delta > 0 ? `▲ +${delta.toFixed(2)}` : `▼ ${delta.toFixed(2)}`) : "—"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
