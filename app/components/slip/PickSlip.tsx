"use client";

import { useState } from "react";
import type { Match } from "@/app/types";
import type { Selection } from "@/app/components/odds/OddsCard";
import ui from "@/app/styles/ui.module.css";
import styles from "./slip.module.css";

const STAKES = [25, 100, 250];

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
  const odds =
    sel.market === "totals"
      ? sel.outcome === "over"
        ? (match.totals?.over ?? 0)
        : (match.totals?.under ?? 0)
      : match.odds[sel.outcome as "home" | "draw" | "away"];
  const label =
    sel.market === "totals"
      ? `${sel.outcome} ${match.totals?.line} goals · ${match.home.toLowerCase()}–${match.away.toLowerCase()}`
      : sel.outcome === "draw"
        ? "draw"
        : sel.outcome === "home"
          ? `${match.homeFlag} ${match.home.toLowerCase()} to win`
          : `${match.awayFlag} ${match.away.toLowerCase()} to win`;

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
