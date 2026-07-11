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
  const meId = String(me.id);
  const myFren = frens.find((f) => f.id === meId);

  /** project flat (x,y)% onto the perspective pitch: rows get narrower
   *  toward the far goal, like the tv camera view */
  const project = (x: number, y: number) => {
    const yNorm = Math.min(1, Math.max(0, (y - 12) / 74)); // 0 far → 1 near
    const top = 20 + yNorm * 48; // 20%..68% of container height
    const width = 0.42 + 0.52 * yNorm; // narrow at top, wide at bottom
    const left = 50 + (x - 50) * width;
    return { left, top };
  };

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
            : f.online
              ? styles.frenOnline
              : "";
          const sel = selected?.id === f.id ? styles.frenSelected : "";
          const away = !f.online ? styles.away : "";
          const pos = project(f.x, f.y);
          return (
            <button
              key={f.id}
              className={`${styles.fren} ${state} ${sel} ${away}`}
              style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
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
