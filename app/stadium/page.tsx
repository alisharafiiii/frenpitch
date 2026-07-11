"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Fren, MatchEvent } from "@/app/types";
import { mockFrens } from "@/app/data/mock-frens";
import { bus } from "@/app/lib/events";
import { TxLineClient } from "@/app/lib/txline";
import { FrenSheet } from "@/app/components/stadium/FrenSheet";
import { Avatar } from "@/app/components/Avatar";
import { api } from "@/app/lib/api";
import { shareToContacts } from "@/app/lib/telegram";
import ui from "@/app/styles/ui.module.css";
import styles from "./stadium.module.css";

const GRADIENTS: [string, string][] = [
  ["#00b894", "#55efc4"],
  ["#e17055", "#fab1a0"],
  ["#0984e3", "#74b9ff"],
  ["#fdcb6e", "#ffeaa7"],
  ["#a29bfe", "#6c5ce7"],
  ["#fd79a8", "#e84393"],
];

interface ServerFrenPick {
  id: string;
  matchId: string;
  matchLabel: string;
  outcome: "home" | "draw" | "away";
  outcomeLabel: string;
  lockedOdds: number;
  stake: number;
  status: "open" | "won" | "lost";
}

interface ServerFren {
  id: string;
  handle: string;
  initial: string;
  photoUrl?: string;
  pnl: number;
  streak: number;
  online: boolean;
  x: number;
  y: number;
  livePick: ServerFrenPick | null;
  lastPick: ServerFrenPick | null;
}

function toFren(f: ServerFren, i: number): Fren {
  const mapPick = (p: ServerFrenPick | null): Fren["livePick"] =>
    p
      ? {
          ...p,
          currentOdds: p.lockedOdds,
          status: p.status === "open" ? "live" : p.status,
          livePnl: 0,
        }
      : undefined;
  return {
    id: f.id,
    handle: f.handle,
    initial: f.initial,
    photoUrl: f.photoUrl,
    gradient: GRADIENTS[i % GRADIENTS.length],
    pnl: f.pnl,
    streak: f.streak,
    online: f.online,
    x: f.x,
    y: f.y,
    livePick: mapPick(f.livePick),
    lastPick: mapPick(f.lastPick),
  };
}

export default function StadiumPage() {
  const [frens, setFrens] = useState<Fren[]>([]);
  const [selected, setSelected] = useState<Fren | null>(null);
  const [goalFlash, setGoalFlash] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // real frens only — no bots on the pitch
  useEffect(() => {
    api<{ frens: ServerFren[] }>("/api/stadium")
      .then(({ frens: real }) => {
        const mapped = real.map(toFren);
        setFrens(mapped);
        if (mapped.length > 0) setSelected(mapped[0]);
        setLoaded(true);
      })
      .catch(() => {
        // mocks ONLY on localhost — production shows the empty pitch
        if (window.location.hostname === "localhost") setFrens(mockFrens);
        setLoaded(true);
      });
  }, []);

  // live: goals ripple through the lobby, odds moves update fren pnl
  useEffect(() => {
    const client = new TxLineClient("auto", 10);
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

        {loaded && frens.length === 0 && (
          <div className={styles.emptyPitch}>
            the pitch is empty 👀
            <br />
            invite your frens — first one in gets bragging rights
          </div>
        )}

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
              <Avatar
                photoUrl={f.photoUrl}
                initial={f.initial}
                gradient={f.gradient}
                size={40}
                fontSize={14}
                className={styles.frenAvatar}
              />
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
        <button
          className={ui.btnGhost}
          onClick={() =>
            shareToContacts(
              "https://t.me/frenpitch_bot/app",
              "⚽ join me in the stadium — live picks, fren tournaments, football quizzes. see you on the pitch 🫡"
            )
          }
        >
          👤 invite from contacts
        </button>
      </div>
    </>
  );
}
