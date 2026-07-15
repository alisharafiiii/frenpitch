"use client";

import { useEffect, useState } from "react";
import { useTgUser } from "@/app/lib/useTgUser";
import { useApi } from "@/app/lib/useApi";
import { api } from "@/app/lib/api";
import type { Match } from "@/app/types";
import { Avatar } from "@/app/components/Avatar";
import {
  IconBars,
  IconFire,
  IconQr,
  IconRobot,
  IconTarget,
  IconTrophy,
} from "@/app/components/icons";
import ui from "@/app/styles/ui.module.css";
import styles from "./me.module.css";

interface Profile {
  handle: string;
  id: string;
  level: number;
  title: string;
  points: number;
  bankroll: number;
  pnl: number;
  record: { won: number; lost: number };
  stats: {
    tournaments: number;
    wins: number;
    winStreak: number;
    accuracy: number | null;
  };
  achievements: { key: string; name: string; desc: string; earned: boolean }[];
}

interface PickRow {
  id: string;
  matchLabel: string;
  outcome: "home" | "draw" | "away";
  outcomeLabel: string;
  lockedOdds: number;
  stake: number;
  status: "open" | "won" | "lost";
  createdAt: number;
}

const BADGE_COLORS: Record<string, string> = {
  quiz_wizard: "#8b7ff5",
  sharp_shooter: "#34d399",
  hot_streak: "#f0b429",
  tournamenter: "#60a5fa",
  frens_united: "#8b7ff5",
};

/** my picks — active bets + settled history */
function MyPicks() {
  const { data } = useApi<{ picks: PickRow[] }>("/api/picks?limit=30");
  const [showAll, setShowAll] = useState(false);
  const picks = data?.picks ?? [];
  const active = picks.filter((p) => p.status === "open");
  const history = picks.filter((p) => p.status !== "open");
  const shown = showAll ? history : history.slice(0, 5);

  if (picks.length === 0) return null;

  const row = (p: PickRow, i: number) => {
    const payout = Math.round(p.stake * p.lockedOdds);
    return (
      <div key={p.id} className={styles.pickRow} style={{ animationDelay: `${i * 0.05}s` }}>
        <div className={styles.pickMain}>
          <div className={styles.pickLabel}>{p.matchLabel || "match"}</div>
          <div className={styles.pickSub}>
            {p.outcomeLabel} @ {p.lockedOdds.toFixed(2)} · {p.stake} pts
          </div>
        </div>
        {p.status === "open" ? (
          <div className={styles.pickRight}>
            <span className={styles.pickOpen}>
              <span className={ui.liveDot} /> open
            </span>
            <span className={styles.pickPotential}>→ {payout}</span>
          </div>
        ) : p.status === "won" ? (
          <span className={styles.pickWon}>+{payout - p.stake}</span>
        ) : (
          <span className={styles.pickLost}>-{p.stake}</span>
        )}
      </div>
    );
  };

  return (
    <>
      {active.length > 0 && (
        <>
          <div className={styles.secHead}>
            <IconTarget size={16} color="var(--tma-fg-dim)" /> ACTIVE PICKS
            <span className={styles.secCount}>{active.length}</span>
          </div>
          <div className={styles.picksCard}>{active.map(row)}</div>
        </>
      )}
      {history.length > 0 && (
        <>
          <div className={styles.secHead}>
            <IconBars size={16} color="var(--tma-fg-dim)" /> PICK HISTORY
            <span className={styles.secCount}>{history.length}</span>
          </div>
          <div className={styles.picksCard}>
            {shown.map(row)}
            {history.length > 5 && (
              <button className={styles.moreBtn} onClick={() => setShowAll(!showAll)}>
                {showAll ? "show less" : `show all ${history.length}`}
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}

interface FollowState {
  setting: { mode: "auto" | "match"; matchId?: string; matchLabel?: string };
  resolvedMatchId: string | null;
}

/** droid "following" selector — auto (latest pick) or pinned fixture.
 *  saving retargets the droid instantly via server-side feed filtering. */
function DroidFollow() {
  const { data: follow, refresh } = useApi<FollowState>("/api/droid/follow");
  const { data: fx } = useApi<{ matches: Match[] }>("/api/fixtures");
  const [saving, setSaving] = useState(false);

  const matches = (fx?.matches ?? []).filter((m) => m.status !== "ft").slice(0, 12);
  const value =
    follow?.setting.mode === "match" ? String(follow.setting.matchId) : "auto";

  const onChange = async (v: string) => {
    setSaving(true);
    try {
      if (v === "auto") {
        await api("/api/droid/follow", { method: "POST", body: { mode: "auto" } });
      } else {
        const m = matches.find((x) => String(x.id) === v);
        await api("/api/droid/follow", {
          method: "POST",
          body: { mode: "match", matchId: v, matchLabel: m ? `${m.home}–${m.away}` : undefined },
        });
      }
      refresh();
    } catch {
      /* keep old selection on failure */
    }
    setSaving(false);
  };

  return (
    <div className={styles.followRow}>
      <span className={styles.followLabel}>following</span>
      <select
        className={styles.followSelect}
        value={value}
        disabled={saving}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="auto">auto — my latest pick</option>
        {matches.map((m) => (
          <option key={m.id} value={String(m.id)}>
            {m.home} vs {m.away}
            {m.status === "live" || m.status === "ht"
              ? ` · live ${m.status === "ht" ? "ht" : `${m.minute}'`}`
              : ` · ${new Date(m.kickoffUtc).toISOString().slice(11, 16)} utc`}
          </option>
        ))}
      </select>
    </div>
  );
}

function BadgeIcon({ k, color }: { k: string; color: string }) {
  if (k === "quiz_wizard")
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/nav-quiz-on.webp" alt="" width={44} height={44} />
    );
  if (k === "sharp_shooter") return <IconTarget size={34} color={color} />;
  if (k === "hot_streak") return <IconFire size={34} color={color} />;
  if (k === "tournamenter") return <IconTrophy size={34} color={color} />;
  return <IconRobot size={34} color={color} />;
}

export default function MePage() {
  const user = useTgUser();
  const { data: profile } = useApi<Profile>("/api/profile");
  const [bridge, setBridge] = useState(false);

  useEffect(() => {
    setBridge(
      typeof window !== "undefined" &&
        Boolean((window as { Telegram?: { WebApp?: unknown } }).Telegram?.WebApp)
    );
  }, []);

  return (
    <>
      {/* player card */}
      <div className={styles.card}>
        <div className={styles.profileTop}>
          <div className={styles.pfpRing}>
            <Avatar
              photoUrl={user.id ? `/api/avatar/${user.id}` : undefined}
              initial={(user.name[0] ?? "?").toUpperCase()}
              gradient={["#6c5ce7", "#a29bfe"]}
              size={80}
              fontSize={28}
            />
          </div>
          <div className={styles.profileMain}>
            <div className={styles.nameRow}>
              {profile?.handle ?? user.username}
              <svg width="19" height="19" viewBox="0 0 24 24" fill="#8b7ff5" aria-hidden>
                <path d="M12 2l2.4 2.4 3.3-.5 1 3.2 3 1.5-1.2 3.4 1.2 3.4-3 1.5-1 3.2-3.3-.5L12 22l-2.4-2.4-3.3.5-1-3.2-3-1.5 1.2-3.4L2.3 8.6l3-1.5 1-3.2 3.3.5L12 2z" />
                <path d="M9.2 12.2l2 2 3.8-4" stroke="#0d0d15" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className={styles.badgeRow}>
              <span className={styles.levelChip}>LEVEL {profile?.level ?? 1}</span>
              <span style={{ color: "var(--tma-fg-muted)" }}>·</span>
              <span className={styles.title}>{profile?.title ?? "Rookie"}</span>
            </div>
            <div className={styles.diag}>
              tg bridge: {bridge ? "✅ connected" : "❌ not detected"} · v6
              <br />
              server sees: {profile ? `${profile.handle} (id ${profile.id})` : "checking…"}
            </div>
          </div>
          <div className={styles.pointsChip}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b7ff5" strokeWidth="1.8" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v10M15.5 9.5c-.6-1-1.9-1.5-3.5-1.5-1.8 0-3 .9-3 2.2 0 2.9 6.8 1.4 6.8 4.3 0 1.4-1.4 2.3-3.3 2.3-1.7 0-3-.6-3.6-1.6" strokeLinecap="round" />
            </svg>
            <div>
              <div className={`${styles.pointsValue} ${ui.num}`}>
                {(profile?.bankroll ?? 0).toLocaleString()}
              </div>
              <div className={styles.pointsLabel}>bankroll</div>
              <div
                className={`${styles.pnlLine} ${ui.num}`}
                style={{ color: (profile?.pnl ?? 0) >= 0 ? "#34d399" : "#f87171" }}
              >
                {(profile?.pnl ?? 0) >= 0 ? "+" : ""}
                {(profile?.pnl ?? 0).toLocaleString()} pnl
              </div>
            </div>
          </div>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.statCell}>
            <IconTarget size={22} color="#8b7ff5" />
            <div className={`${styles.statNum} ${ui.num}`}>{profile?.stats.tournaments ?? 0}</div>
            <div className={styles.statCap}>tournaments</div>
          </div>
          <div className={styles.statCell}>
            <IconTrophy size={22} color="#8b7ff5" />
            <div className={`${styles.statNum} ${ui.num}`}>
              {profile?.record ? `${profile.record.won}-${profile.record.lost}` : "0-0"}
            </div>
            <div className={styles.statCap}>won-lost</div>
          </div>
          <div className={styles.statCell}>
            <IconFire size={22} color="#8b7ff5" />
            <div className={`${styles.statNum} ${ui.num}`}>{profile?.stats.winStreak ?? 0}</div>
            <div className={styles.statCap}>win streak</div>
          </div>
          <div className={styles.statCell}>
            <IconBars size={22} color="#8b7ff5" />
            <div className={`${styles.statNum} ${ui.num}`}>
              {profile?.stats.accuracy !== null && profile !== undefined
                ? `${profile.stats.accuracy}%`
                : "—"}
            </div>
            <div className={styles.statCap}>accuracy</div>
          </div>
        </div>
      </div>

      {/* active picks + history */}
      <MyPicks />

      {/* stackchan droid */}
      <div className={styles.secHead}>
        <IconRobot size={16} color="var(--tma-fg-dim)" /> STACKCHAN DROID
      </div>
      <div className={styles.rowCard} style={{ flexWrap: "wrap" }}>
        <div className={styles.artCircle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-droid.webp" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div className={styles.rowMain}>
          <div className={styles.rowTitle}>pair your matchday droid</div>
          <p className={styles.rowCopy}>
            your stackchan reacts to goals, calls odds moves, roasts your frens&apos;
            picks, and hosts halftime quizzes. scan the qr from the droid screen to pair.
          </p>
        </div>
        <div className={styles.qrTile}>
          <IconQr size={30} />
        </div>
        <button className={styles.pairBtn}>
          <IconQr size={16} /> pair droid (qr)
        </button>
        <DroidFollow />
      </div>

      {/* wallet */}
      <div className={styles.secHead}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tma-fg-dim)" strokeWidth="1.8" aria-hidden>
          <rect x="3" y="6" width="18" height="13" rx="2.5" />
          <path d="M3 10h18M16 15h2" strokeLinecap="round" />
        </svg>
        WALLET
      </div>
      <div className={styles.rowCard}>
        <div className={styles.artCircle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-wallet.webp" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div className={styles.rowMain}>
          <div className={styles.rowTitle}>
            solana wallet <span className={styles.embeddedChip}>embedded</span>
          </div>
          <p className={styles.rowCopy}>
            embedded solana wallet — created silently on first login. only tournament
            buy-ins touch the chain; points stay off-chain for speed.
          </p>
        </div>
        <span className={styles.chevron}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </div>

      {/* achievements */}
      <div className={styles.secHead}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tma-fg-dim)" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
          <path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.4 6.8 19.2l1-5.9L3.5 9.2l5.9-.8L12 3z" />
        </svg>
        ACHIEVEMENTS
      </div>
      <div className={styles.card} style={{ padding: "14px 10px 6px" }}>
        <div className={styles.achieveStrip}>
          {(profile?.achievements ?? []).map((a) => {
            const color = BADGE_COLORS[a.key] ?? "#8b7ff5";
            return (
              <div key={a.key} className={`${styles.badge} ${a.earned ? "" : styles.locked}`}>
                <div
                  className={styles.hex}
                  style={{
                    background: `${color}1f`,
                    boxShadow: a.earned ? `inset 0 0 24px ${color}44` : undefined,
                  }}
                >
                  <BadgeIcon k={a.key} color={color} />
                </div>
                <div className={styles.badgeName} style={{ color }}>
                  {a.name}
                </div>
                <div className={styles.badgeDesc}>{a.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* settings */}
      <div className={styles.menuCard}>
        <button className={styles.menuRow}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--tma-fg-dim)" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19 12a7 7 0 0 0-.2-1.6l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.8-1.6L13.3 2h-2.6l-.4 2.9a7 7 0 0 0-2.8 1.6l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .5.1 1.1.2 1.6l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.8 1.6l.4 2.9h2.6l.4-2.9a7 7 0 0 0 2.8-1.6l2.3 1 2-3.4-2-1.5c.1-.5.2-1 .2-1.6z" />
          </svg>
          settings
          <span className={styles.menuChevron}>›</span>
        </button>
        <button className={styles.menuRow}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--tma-fg-dim)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" />
            <path d="M12 8v4M12 15.5v.5" />
          </svg>
          privacy &amp; security
          <span className={styles.menuChevron}>›</span>
        </button>
        <a href="https://t.me/frenpitch_bot" className={styles.menuRow} style={{ textDecoration: "none" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--tma-fg-dim)" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.6c0 1.6-2.4 2-2.4 3.4M12 17v.5" />
          </svg>
          help &amp; support
          <span className={styles.menuChevron}>›</span>
        </a>
      </div>
    </>
  );
}
