"use client";

import type { Fren } from "@/app/types";
import ui from "@/app/styles/ui.module.css";
import styles from "./fren-sheet.module.css";

/** bottom sheet inside the stadium: fren's live pick + sweat view */
export function FrenSheet({ fren, onClose }: { fren: Fren; onClose: () => void }) {
  const pick = fren.livePick ?? fren.lastPick;

  return (
    <div className={styles.sheet}>
      <button className={styles.close} onClick={onClose} aria-label="close">
        ✕
      </button>
      <div className={styles.top}>
        <span
          className={`${ui.avatar} ${styles.avatar}`}
          style={{
            background: `linear-gradient(135deg, ${fren.gradient[0]}, ${fren.gradient[1]})`,
          }}
        >
          {fren.initial}
        </span>
        <div>
          <div className={styles.name}>{fren.handle}</div>
          <div className={styles.sub}>
            {fren.livePick ? "live pick" : fren.lastPick ? "last pick" : "no picks yet"}
            {fren.streak > 1 && ` · ${fren.streak} win streak 🔥`}
          </div>
        </div>
        <div className={styles.pnl}>
          <div className={styles.pnlLabel}>MATCHDAY PNL</div>
          <div
            className={`${styles.pnlValue} ${ui.num} ${fren.pnl >= 0 ? ui.pos : ui.neg}`}
          >
            {fren.pnl >= 0 ? "+" : ""}
            {fren.pnl} pts
          </div>
        </div>
      </div>

      {pick ? (
        <div className={styles.betLine}>
          <span>
            {pick.matchLabel.split(" vs")[0]} {pick.outcomeLabel}{" "}
            <b className={ui.num}>@ {pick.lockedOdds.toFixed(2)}</b>
          </span>
          <span
            className={`${styles.oddsMove} ${
              pick.currentOdds >= pick.lockedOdds ? ui.pos : ui.neg
            } ${ui.num}`}
          >
            now {pick.currentOdds.toFixed(2)}
          </span>
        </div>
      ) : (
        <div className={ui.emptyState}>this fren hasn&apos;t locked a pick yet 👀</div>
      )}
    </div>
  );
}
