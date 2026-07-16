"use client";

import { useState } from "react";
import type { Match } from "@/app/types";
import type { Selection } from "@/app/components/odds/OddsCard";
import ui from "@/app/styles/ui.module.css";
import styles from "./slip.module.css";

const STAKES = [25, 100, 250];

/** odds + human label for any selection — shared with the confirm flow */
export function resolveSelection(
  match: Match,
  sel: Selection
): { odds: number; label: string; line?: number } {
  const pair = `${match.home.toLowerCase()}–${match.away.toLowerCase()}`;
  if (sel.market === "totals" && match.totals) {
    return {
      odds: sel.outcome === "over" ? match.totals.over : match.totals.under,
      label: `${sel.outcome} ${match.totals.line} goals · ${pair}`,
      line: match.totals.line,
    };
  }
  if (sel.market === "totals1h" && match.totals1h) {
    return {
      odds: sel.outcome === "over" ? match.totals1h.over : match.totals1h.under,
      label: `1h ${sel.outcome} ${match.totals1h.line} · ${pair}`,
      line: match.totals1h.line,
    };
  }
  if (sel.market === "ah") {
    const l = match.ah?.find((x) => x.line === sel.line);
    if (l) {
      const team = sel.outcome === "home" ? match.home : match.away;
      return {
        odds: sel.outcome === "home" ? l.home : l.away,
        label: `${team.toLowerCase()} ${l.line > 0 ? "+" : ""}${l.line} handicap`,
        line: l.line,
      };
    }
  }
  const o = sel.outcome as "home" | "draw" | "away";
  return {
    odds: match.odds[o],
    label:
      o === "draw"
        ? "draw"
        : o === "home"
          ? `${match.homeFlag} ${match.home.toLowerCase()} to win`
          : `${match.awayFlag} ${match.away.toLowerCase()} to win`,
  };
}

export function PickSlip({
  match,
  sel,
  bankroll,
  onConfirm,
  onClose,
}: {
  match: Match;
  sel: Selection;
  bankroll: number;
  onConfirm: (stake: number) => void;
  onClose: () => void;
}) {
  const [stake, setStake] = useState(100);
  const { odds, label } = resolveSelection(match, sel);

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.slip}>
        <div className={styles.grab} />
        <div className={styles.matchRow}>
          <div>
            <div className={styles.pick}>{label}</div>
            <div className={styles.sub}>
              {match.status === "live" ? `live ${match.minute}'` : "pre-match"} · txline
              consensus
            </div>
          </div>
          <div className={`${styles.odds} ${ui.num}`}>@ {odds.toFixed(2)}</div>
        </div>

        <div className={ui.formLabel}>stake (matchday points)</div>
        <div className={styles.stakeRow}>
          {STAKES.map((s) => (
            <button
              key={s}
              className={stake === s ? styles.chipOn : styles.chip}
              onClick={() => setStake(s)}
            >
              {s}
            </button>
          ))}
          <button
            className={stake === bankroll ? styles.chipOn : styles.chip}
            onClick={() => setStake(bankroll)}
          >
            max {bankroll}
          </button>
        </div>

        <div className={styles.payout}>
          <span>potential payout</span>
          <b className={`${ui.pos} ${ui.num}`}>{Math.round(stake * odds)} pts</b>
        </div>
        <div className={styles.note}>
          odds locked at confirm · settled automatically by txline events
        </div>

        <button className={ui.btnPrimary} onClick={() => onConfirm(stake)}>
          lock it in 🔐
        </button>
        <div className={ui.fairNote}>
          your pick shows on your pfp in the stadium — frens can sweat it with you
        </div>
      </div>
    </>
  );
}
