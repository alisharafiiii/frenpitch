"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Fren, MatchEvent } from "@/app/types";
import { mockFrens } from "@/app/data/mock-frens";
import { bus } from "@/app/lib/events";
import { TxLineClient } from "@/app/lib/txline";
import { FrenSheet } from "@/app/components/stadium/FrenSheet";
import ui from "@/app/styles/ui.module.css";
import styles from "./stadium.module.css";

export default function StadiumPage() {
  const [frens, setFrens] = useState<Fren[]>(mockFrens);
  const [selected, setSelected] = useState<Fren | null>(
    mockFrens.find((f) => f.handle === "mika.sol") ?? null
  );
  const [goalFlash, setGoalFlash] = useState(false);

  // live: goals ripple through the lobby, odds moves update fren pnl
  useEffect(() => {
    const client = new TxLineClient("replay", 10);
    client.connect();
    const unsub = bus.subscribe((e: MatchEvent) => {
      if (e.type === "goal") {
        setGoalFlash(true);
        setTimeout(() => setGoalFlash(false), 1600);
      }
      if (e.type === "odds_move" && e.odds) {
        setFrens((prev) =>
          prev.map((f) => {
            if (!f.livePick || f.livePick.matchId !== e.matchId) return f;
            const cur = e.odds![f.livePick.outcome];
            // toy live-pnl model for the mock: value of position vs locked odds
            const pnl = Math.round(
              f.livePick.stake * (f.livePick.lockedOdds / cur - 1) * 2
            );
            return {
              ...f,
              pnl,
              livePick: { ...f.livePick, currentOdds: cur, livePnl: pnl },
            };
          })
        );
      }
    });
    return () => {
      unsub();
      client.disconnect();
    };
  }, []);

  const liveCount = frens.filter((f) => f.livePick).length;

  return (
    <>
      <div className={styles.head}>
        <div>
          <h2>the stadium 🏟️</h2>
          <p>
            {frens.length} frens in the lobby · {liveCount} live picks sweating
          </p>
        </div>
        <span className={ui.pillLive}>
          <span className={ui.liveDot} />
          LIVE
        </span>
      </div>

      <div className={`${styles.stadium} ${goalFlash ? styles.goalFlash : ""}`}>
        <div className={styles.stands} />
        <div className={styles.pitch}>
          <div className={styles.boxTop} />
          <div className={styles.boxBot} />
        </div>

        {frens.map((f) => {
          const state = f.livePick
            ? f.pnl >= 0
              ? styles.frenUp
              : styles.frenDown
            : styles.frenIdle;
          const sel = selected?.id === f.id ? styles.frenSelected : "";
          return (
            <button
              key={f.id}
              className={`${styles.fren} ${state} ${sel}`}
              style={{ left: `${f.x}%`, top: `${f.y}%` }}
              onClick={() => setSelected(f)}
            >
              <span
                className={`${ui.avatar} ${styles.frenAvatar}`}
                style={{
                  background: `linear-gradient(135deg, ${f.gradient[0]}, ${f.gradient[1]})`,
                }}
              >
                {f.initial}
              </span>
              <span className={styles.tag}>
                {f.livePick ? (f.pnl >= 0 ? `+${f.pnl}` : f.pnl) : "idle"}
              </span>
            </button>
          );
        })}

        {selected && <FrenSheet fren={selected} onClose={() => setSelected(null)} />}
      </div>

      <div className={styles.ctaRow}>
        <Link href="/tournaments/new" className={ui.btnPrimary} style={{ textAlign: "center", textDecoration: "none", display: "block" }}>
          ⚔️ create tournament
        </Link>
        <button className={ui.btnGhost}>+ invite frens</button>
      </div>
    </>
  );
}
