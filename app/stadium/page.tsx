"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Fren, MatchEvent } from "@/app/types";
import { mockFrens } from "@/app/data/mock-frens";
import { bus } from "@/app/lib/events";
import { TxLineClient } from "@/app/lib/txline";
import { FrenSheet } from "@/app/components/stadium/FrenSheet";
import { Avatar } from "@/app/components/Avatar";
import { useApi } from "@/app/lib/useApi";
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

  // real frens only — cached (instant on tab return), refreshed every 15s
  const { data: stadiumData } = useApi<{ frens: ServerFren[] }>("/api/stadium", {
    intervalMs: 15000,
  });
  useEffect(() => {
    if (stadiumData) {
      const mapped = stadiumData.frens.map(toFren);
      setFrens(mapped);
      setSelected((cur) => cur ?? mapped[0] ?? null);
      setLoaded(true);
    } else if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      setFrens(mockFrens);
      setLoaded(true);
    }
  }, [stadiumData]);

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
        {/* crisp svg pitch */}
        <svg
          className={styles.pitchSvg}
          viewBox="0 0 100 150"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
              {Array.from({ length: 10 }).map((_, i) => (
                <stop
                  key={i}
                  offset={`${i * 10}%`}
                  stopColor={i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.06)"}
                />
              ))}
            </linearGradient>
          </defs>
          {/* mowing stripes */}
          <rect x="10" y="8" width="80" height="134" fill="url(#grass)" rx="1.5" />
          <g fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="0.7">
            {/* touchlines */}
            <rect x="10" y="8" width="80" height="134" rx="1.5" />
            {/* halfway + center */}
            <line x1="10" y1="75" x2="90" y2="75" />
            <circle cx="50" cy="75" r="11" />
            {/* penalty areas */}
            <rect x="28" y="8" width="44" height="18" />
            <rect x="28" y="124" width="44" height="18" />
            {/* goal areas */}
            <rect x="39" y="8" width="22" height="7" />
            <rect x="39" y="135" width="22" height="7" />
            {/* penalty arcs */}
            <path d="M 41 26 A 10 10 0 0 0 59 26" />
            <path d="M 41 124 A 10 10 0 0 1 59 124" />
            {/* corner arcs */}
            <path d="M 10 11 A 3 3 0 0 0 13 8" />
            <path d="M 87 8 A 3 3 0 0 0 90 11" />
            <path d="M 13 142 A 3 3 0 0 0 10 139" />
            <path d="M 90 139 A 3 3 0 0 0 87 142" />
          </g>
          {/* spots */}
          <g fill="rgba(255,255,255,0.35)">
            <circle cx="50" cy="21" r="0.8" />
            <circle cx="50" cy="129" r="0.8" />
            <circle cx="50" cy="75" r="0.9" />
          </g>
        </svg>

        {loaded && frens.length === 0 && (
          <div className={styles.emptyPitch}>
            the pitch is empty 👀
            <br />
            invite your frens — first one in gets bragging rights
          </div>
        )}

        {frens.map((f) => {
          const state = f.livePick ? (f.pnl >= 0 ? styles.frenUp : styles.frenDown) : "";
          const sel = selected?.id === f.id ? styles.frenSelected : "";
          const away = !f.online ? styles.away : "";
          return (
            <button
              key={f.id}
              className={`${styles.fren} ${state} ${sel} ${away}`}
              style={{ left: `${f.x}%`, top: `${f.y}%` }}
              onClick={() => setSelected(f)}
            >
              <span className={styles.avatarWrap}>
                <Avatar
                  photoUrl={f.photoUrl}
                  initial={f.initial}
                  gradient={f.gradient}
                  size={42}
                  fontSize={15}
                  className={styles.frenAvatar}
                />
                <span className={styles.statusDot} data-online={f.online} />
              </span>
              <span className={styles.handleLabel}>{f.handle}</span>
              {f.livePick && (
                <span className={styles.pnlChip}>
                  {f.pnl >= 0 ? `+${f.pnl}` : f.pnl}
                </span>
              )}
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
