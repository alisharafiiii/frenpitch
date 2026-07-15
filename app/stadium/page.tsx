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
import { useTgUser } from "@/app/lib/useTgUser";
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
  lastSeen: number;
  hasPhoto?: boolean;
  x: number;
  y: number;
  livePick: ServerFrenPick | null;
  lastPick: ServerFrenPick | null;
}

/** max frens on the pitch — a full starting XI in formation.
 *  most recently active take the field. */
const MAX_ON_PITCH = 11;

/** 1-4-3-3 formation, container % — gk at the far goal, strikers near */
const FORMATION: { x: number; y: number }[] = [
  { x: 50, y: 13 }, // gk
  { x: 24, y: 26 }, // back four
  { x: 41, y: 24 },
  { x: 59, y: 24 },
  { x: 76, y: 26 },
  { x: 27, y: 41 }, // midfield three
  { x: 50, y: 38 },
  { x: 73, y: 41 },
  { x: 20, y: 57 }, // front three
  { x: 50, y: 60 },
  { x: 80, y: 57 },
];

/** touchline spots — benches along both sidelines, right by the pitch.
 *  alternating left/right, top to bottom. */
const SIDELINE_SEATS: { x: number; y: number; s: number }[] = Array.from(
  { length: 16 },
  (_, i) => {
    const row = Math.floor(i / 2);
    const left = i % 2 === 0;
    const y = 16 + row * 7.5; // 16%..68.5%
    const inset = 3.5 + (y / 70) * 4; // sidelines widen toward the near end
    return { x: left ? inset : 100 - inset, y, s: 0.6 + (y / 70) * 0.2 };
  }
);

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
  const me = useTgUser();
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
      // real pfps take the pitch first, then most recently active
      const sorted = [...stadiumData.frens].sort(
        (a, b) =>
          Number(b.hasPhoto ?? false) - Number(a.hasPhoto ?? false) ||
          b.lastSeen - a.lastSeen
      );
      setFrens(sorted.map(toFren));
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
            // totals picks don't reprice from 1x2 moves
            if (f.livePick.outcome === "over" || f.livePick.outcome === "under") return f;
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
  const meId = String(me.id);
  const myFren = frens.find((f) => f.id === meId);
  // you live in the corner card — the pitch is for your frens
  const others = frens.filter((f) => f.id !== meId);

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
        {/* rendered stadium art (public/stadium-bg.png) — svg below stays
            as the instant-loading fallback if the image is missing */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/stadium-bg.webp"
          alt=""
          className={styles.bgArt}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        {/* night stadium scene */}
        <svg
          className={styles.pitchSvg}
          viewBox="0 0 100 150"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient id="grassP" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0a2f22" />
              <stop offset="55%" stopColor="#0c3a29" />
              <stop offset="100%" stopColor="#0a301f" />
            </linearGradient>
            <radialGradient id="floodGlow" cx="50%" cy="30%" r="75%">
              <stop offset="0%" stopColor="rgba(120,255,190,0.10)" />
              <stop offset="60%" stopColor="rgba(108,92,231,0.05)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>

          {/* stands: dark tiers with purple neon rims */}
          {[46, 41, 36].map((r, i) => (
            <ellipse
              key={r}
              cx="50"
              cy="72"
              rx={r + 14}
              ry={r + 26}
              fill="none"
              stroke={i === 0 ? "#131318" : "#0f0f14"}
              strokeWidth={i === 0 ? 14 : 10}
              opacity={0.9}
            />
          ))}
          <ellipse cx="50" cy="72" rx="49" ry="70" fill="none" stroke="rgba(108,92,231,0.28)" strokeWidth="0.6" />
          <ellipse cx="50" cy="72" rx="44" ry="63" fill="none" stroke="rgba(108,92,231,0.18)" strokeWidth="0.5" />
          {/* floodlight dot rows on the stands */}
          {Array.from({ length: 26 }).map((_, i) => {
            const a = (i / 26) * Math.PI * 2;
            return (
              <circle
                key={i}
                cx={50 + Math.cos(a) * 46}
                cy={72 + Math.sin(a) * 66}
                r="0.7"
                fill="rgba(255,255,255,0.5)"
                opacity={0.35 + (i % 3) * 0.2}
              />
            );
          })}

          {/* perspective pitch (tv camera view) */}
          <polygon points="29,20 71,20 92,122 8,122" fill="url(#grassP)" />
          {/* mowing bands, perspective spaced */}
          {[0, 1, 2, 3, 4, 5, 6].map((i) => {
            const t0 = i / 7;
            const t1 = (i + 0.5) / 7;
            const y0 = 20 + t0 * t0 * 102 + t0 * 0;
            const y1 = 20 + t1 * t1 * 102;
            const w0 = 21 + (42 - 21) * ((y0 - 20) / 102) * 2;
            const w1 = 21 + (42 - 21) * ((y1 - 20) / 102) * 2;
            return (
              <polygon
                key={i}
                points={`${50 - w0},${y0} ${50 + w0},${y0} ${50 + w1},${y1} ${50 - w1},${y1}`}
                fill={i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.05)"}
              />
            );
          })}
          <g fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.55">
            {/* touchlines */}
            <polygon points="29,20 71,20 92,122 8,122" />
            {/* halfway + center ellipse */}
            <line x1="17" y1="78" x2="83" y2="78" />
            <ellipse cx="50" cy="78" rx="13" ry="4.5" />
            {/* far penalty box + goal box */}
            <polygon points="38,20 62,20 64,31 36,31" />
            <polygon points="44,20 56,20 57,24.5 43,24.5" />
            {/* near penalty box + goal box */}
            <polygon points="34,104 66,104 70,122 30,122" />
            <polygon points="42,114 58,114 60,122 40,122" />
          </g>
          {/* goals with nets */}
          <g stroke="rgba(255,255,255,0.55)" strokeWidth="0.45" fill="rgba(255,255,255,0.05)">
            <rect x="43.5" y="15.5" width="13" height="4.5" />
            <rect x="39" y="122" width="22" height="7" />
          </g>
          <g stroke="rgba(255,255,255,0.18)" strokeWidth="0.25">
            {[1, 2, 3].map((i) => (
              <line key={`fn${i}`} x1={43.5 + i * 3.25} y1="15.5" x2={43.5 + i * 3.25} y2="20" />
            ))}
            {[1, 2, 3, 4, 5].map((i) => (
              <line key={`nn${i}`} x1={39 + i * 3.6} y1="122" x2={39 + i * 3.6} y2="129" />
            ))}
          </g>
          {/* led board above the far goal */}
          <rect x="34" y="6" width="32" height="7" rx="1.5" fill="#08080c" stroke="rgba(108,92,231,0.6)" strokeWidth="0.4" />
          <text x="50" y="10" textAnchor="middle" fontSize="3.4" fontWeight="800" fill="#00e6a0" fontFamily="inherit">
            FP
          </text>
          <text x="50" y="12.4" textAnchor="middle" fontSize="1.7" fontWeight="700" letterSpacing="0.8" fill="rgba(255,255,255,0.75)" fontFamily="inherit">
            FRENPITCH
          </text>
          {/* floodlight wash over everything */}
          <rect x="0" y="0" width="100" height="150" fill="url(#floodGlow)" />
        </svg>

        {/* corner stat cards */}
        <div className={styles.cornerCard} style={{ left: 10, top: 10 }}>
          <div className={styles.cornerLabel}>MATCHDAY PNL</div>
          <div
            className={`${ui.num} ${styles.cornerValue} ${(myFren?.pnl ?? 0) >= 0 ? ui.pos : ui.neg}`}
          >
            {(myFren?.pnl ?? 0) >= 0 ? "+" : ""}
            {myFren?.pnl ?? 0} pts
          </div>
        </div>
        <div className={`${styles.cornerCard} ${styles.cornerRight}`} style={{ right: 10, top: 10 }}>
          <Avatar
            photoUrl={myFren?.photoUrl ?? (me.id ? `/api/avatar/${me.id}` : undefined)}
            initial={(me.name[0] ?? "?").toUpperCase()}
            gradient={["#6c5ce7", "#a29bfe"]}
            size={34}
            fontSize={13}
          />
          <div>
            <div className={styles.cornerLabel}>
              {myFren?.livePick ? "LIVE PICK" : "NO PICKS YET"}
            </div>
            <div className={styles.cornerHandle}>{me.username}</div>
          </div>
        </div>

        {loaded && others.length === 0 && (
          <div className={styles.emptyPitch}>
            the pitch is empty 👀
            <br />
            invite your frens — first one in gets bragging rights
          </div>
        )}

        {/* starting XI in formation — most recently active play */}
        {others.slice(0, MAX_ON_PITCH).map((f, i) => {
          const slot = FORMATION[i];
          const state = f.livePick
            ? f.pnl >= 0
              ? styles.frenUp
              : styles.frenDown
            : f.online
              ? styles.frenOnline
              : "";
          const sel = selected?.id === f.id ? styles.frenSelected : "";
          const away = !f.online ? styles.away : "";
          const scale = 0.78 + 0.3 * ((slot.y - 13) / 47); // smaller when far
          return (
            <button
              key={f.id}
              className={`${styles.fren} ${state} ${sel} ${away}`}
              style={{
                left: `${slot.x}%`,
                top: `${slot.y}%`,
                transform: `translate(-50%, -50%) scale(${scale})`,
              }}
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
              <span className={`${styles.pnlChip} ${f.pnl >= 0 ? styles.chipUp : styles.chipDown}`}>
                {f.pnl >= 0 ? `+${f.pnl}` : f.pnl}
              </span>
            </button>
          );
        })}

        {/* the rest wait on the touchlines — right by the pitch */}
        {others.slice(MAX_ON_PITCH, MAX_ON_PITCH + SIDELINE_SEATS.length).map((f, i) => {
          const seat = SIDELINE_SEATS[i];
          const sel = selected?.id === f.id ? styles.frenSelected : "";
          return (
            <button
              key={f.id}
              className={`${styles.fren} ${styles.fanSeat} ${sel} ${!f.online ? styles.away : ""}`}
              style={{
                left: `${seat.x}%`,
                top: `${seat.y}%`,
                transform: `translate(-50%, -50%) scale(${seat.s})`,
              }}
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
            </button>
          );
        })}

        {/* overflow count if even the touchlines are full */}
        {others.length > MAX_ON_PITCH + SIDELINE_SEATS.length && (
          <span className={styles.overflowBadge}>
            +{others.length - MAX_ON_PITCH - SIDELINE_SEATS.length} more warming up
          </span>
        )}

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
