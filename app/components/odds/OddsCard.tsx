"use client";

import type { Match, Outcome } from "@/app/types";
import styles from "./odds.module.css";
import ui from "@/app/styles/ui.module.css";

const RING_COLORS = [
  "#6c5ce7",
  "#e17055",
  "#0984e3",
  "#fdcb6e",
  "#00b894",
  "#fd79a8",
];

function ringFor(code: string): string {
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return RING_COLORS[h % RING_COLORS.length];
}

export function OddsCard({
  match,
  onPick,
  index = 0,
}: {
  match: Match;
  onPick: (m: Match, o: Outcome) => void;
  index?: number;
}) {
  const outcomes: { key: Outcome; label: string }[] = [
    { key: "home", label: match.home },
    { key: "draw", label: "DRAW" },
    { key: "away", label: match.away },
  ];
  const isLive = match.status === "live" || match.status === "ht";
  const hasOdds = match.odds.home > 0;

  return (
    <div className={styles.card} style={{ animationDelay: `${index * 0.07}s` }}>
      {/* teams */}
      <div className={styles.teams}>
        <div className={styles.team}>
          <span className={styles.badge} style={{ borderColor: ringFor(match.home) }}>
            {match.homeFlag}
          </span>
          <span className={styles.code}>{match.home}</span>
        </div>
        <span className={`${styles.vs} ${ui.num}`}>
          {isLive || match.status === "ft"
            ? `${match.scoreHome}–${match.scoreAway}`
            : "vs"}
        </span>
        <div className={styles.team}>
          <span className={styles.badge} style={{ borderColor: ringFor(match.away) }}>
            {match.awayFlag}
          </span>
          <span className={styles.code}>{match.away}</span>
        </div>
      </div>

      {/* odds boxes */}
      <div className={styles.oddsRow}>
        {outcomes.map((o) => {
          const value = match.odds[o.key];
          const delta = match.oddsDelta[o.key];
          const empty = value === 0;
          return (
            <button
              key={o.key}
              className={styles.oddsBox}
              disabled={empty}
              onClick={() => onPick(match, o.key)}
            >
              <span className={styles.oddsLabel}>{o.label}</span>
              <span className={`${styles.oddsValue} ${ui.num} ${empty ? styles.soon : ""}`}>
                {empty ? "soon" : value.toFixed(2)}
                {!empty && delta !== undefined && delta !== 0 && (
                  <span className={delta > 0 ? styles.arrowUp : styles.arrowDown}>
                    {delta > 0 ? "↑" : "↓"}
                  </span>
                )}
              </span>
              {empty && <span className={styles.dash}>–</span>}
            </button>
          );
        })}
      </div>

      {/* right rail: time / live */}
      <div className={styles.rail}>
        {isLive ? (
          <>
            <span className={styles.liveChip}>
              <span className={ui.liveDot} />
              {match.status === "ht" ? "HT" : `${match.minute}'`}
            </span>
            <span className={styles.railIcon}>⚡</span>
          </>
        ) : match.status === "ft" ? (
          <span className={styles.timeChip}>FT</span>
        ) : (
          <>
            <span className={styles.timeChip}>
              {new Date(match.kickoffUtc).toISOString().slice(11, 16)} UTC
            </span>
            <span className={styles.railIcon}>{hasOdds ? "📈" : "⏱"}</span>
          </>
        )}
      </div>
    </div>
  );
}
