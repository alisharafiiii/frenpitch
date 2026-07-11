"use client";

import { useEffect, useMemo, useState } from "react";
import type { Match, MatchEvent, Outcome, Pick } from "@/app/types";
import { mockMatches } from "@/app/data/mock-matches";
import { bus } from "@/app/lib/events";
import { TxLineClient } from "@/app/lib/txline";
import { useTgUser } from "@/app/lib/useTgUser";
import { api, waitForStartParam } from "@/app/lib/api";
import { prefetch, useApi } from "@/app/lib/useApi";

interface ServerPick {
  id: string;
  matchId: string;
  matchLabel: string;
  outcome: Outcome;
  outcomeLabel: string;
  lockedOdds: number;
  stake: number;
  status: "open" | "won" | "lost";
}

function toUiPick(p: ServerPick): Pick {
  return {
    ...p,
    currentOdds: p.lockedOdds,
    status: p.status === "open" ? "live" : p.status,
    livePnl: 0,
  };
}
import { OddsCard } from "./components/odds/OddsCard";
import { PickSlip } from "./components/slip/PickSlip";
import { Avatar } from "./components/Avatar";
import ui from "@/app/styles/ui.module.css";
import styles from "./home.module.css";

export default function HomePage() {
  const user = useTgUser();
  const [matches, setMatches] = useState<Match[]>([]);
  const [bankroll, setBankroll] = useState(720);
  const [myPicks, setMyPicks] = useState<Pick[]>([]);
  const [slip, setSlip] = useState<{ match: Match; outcome: Outcome } | null>(null);

  const [isLive, setIsLive] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const [joinedTour, setJoinedTour] = useState<string | null>(null);
  const [needPass, setNeedPass] = useState<string | null>(null);
  const [passInput, setPassInput] = useState("");
  const [passError, setPassError] = useState(false);
  const [joinExplorer, setJoinExplorer] = useState<string | null>(null);

  // real account: login-or-signup via tg identity, load bankroll + picks.
  // cached → instant on return visits
  const { data: meData } = useApi<{ user: { bankroll: number }; picks: ServerPick[] }>(
    "/api/me"
  );
  useEffect(() => {
    if (meData) {
      setBankroll(meData.user.bankroll);
      setMyPicks(meData.picks.map(toUiPick));
    }
  }, [meData]);

  // warm the other tabs' data so switching is instant
  useEffect(() => {
    prefetch(["/api/tournaments/mine"]);
  }, []);

  // if opened via an invite link (t.me/...?startapp=CODE) → join that
  // tournament first thing, like the minted mind pass flow
  useEffect(() => {
    waitForStartParam((code) => {
      if (code.startsWith("q")) {
        // quiz lobby invite → straight to the quiz tab
        window.location.href = `/quiz?code=${code}`;
        return;
      }
      tryJoin(code);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tryJoin = (code: string, pass?: string) => {
    api<{ joined: boolean }>("/api/tournaments", { method: "PUT", body: { code, pass } })
      .then(() => {
        setNeedPass(null);
        setPassError(false);
        // fund the buy-in from the invisible devnet wallet (real onchain tx)
        api<{ explorer: string }>("/api/tournaments/fund", {
          method: "POST",
          body: { code },
        })
          .then((f) => setJoinExplorer(f.explorer))
          .catch(() => {
            /* escrow not configured — joined anyway */
          });
        return api<{ tournament: { name: string } }>(`/api/tournaments?code=${code}`).then(
          (t) => setJoinedTour(t.tournament.name)
        );
      })
      .catch((err: Error) => {
        if (err.message === "pass_required") {
          setNeedPass(code);
          if (pass !== undefined) setPassError(true);
        }
        /* invalid or full code — ignore */
      });
  };

  // auto feed: real txline stream when the key works, replay otherwise
  useEffect(() => {
    const client = new TxLineClient("auto", 10);
    client.connect().then(({ live, matches: fixtures }) => {
      setIsLive(live);
      if (live && fixtures.length > 0) setMatches(fixtures);
      // replay demo data ONLY on localhost — production stays honest
      else if (!live && window.location.hostname === "localhost") setMatches(mockMatches);
    });
    const unsub = bus.subscribe((e: MatchEvent) => {
      setMatches((prev) =>
        prev.map((m) => {
          if (m.id !== e.matchId) return m;
          const next = { ...m, minute: e.minute };
          if (e.odds) {
            next.oddsDelta = e.outcome && e.delta ? { [e.outcome]: e.delta } : {};
            next.odds = e.odds;
          }
          if (e.scoreHome !== undefined && e.scoreAway !== undefined) {
            next.scoreHome = e.scoreHome;
            next.scoreAway = e.scoreAway;
          }
          if (e.type === "fulltime") next.status = "ft";
          if (e.type === "halftime") next.status = "ht";
          return next;
        })
      );
    });
    return () => {
      unsub();
      client.disconnect();
    };
  }, []);

  // real frens for the online strip — cached, instant on tab return
  const { data: stadiumData } = useApi<{
    frens: {
      id: string;
      handle: string;
      initial: string;
      photoUrl?: string;
      online: boolean;
      livePick: unknown;
    }[];
  }>("/api/stadium", { intervalMs: 30000 });

  const onlineFrens = useMemo(
    () =>
      (stadiumData?.frens ?? [])
        .filter((f) => f.online)
        .map((f) => ({
          id: f.id,
          handle: f.handle,
          initial: f.initial,
          photoUrl: f.photoUrl,
          live: !!f.livePick,
        })),
    [stadiumData]
  );

  const confirmPick = async (stake: number) => {
    if (!slip) return;
    const { match, outcome } = slip;
    const body = {
      matchId: match.id,
      matchLabel: `${match.homeFlag} ${match.home.toLowerCase()} vs ${match.away.toLowerCase()}`,
      outcome,
      outcomeLabel:
        outcome === "draw" ? "draw" : outcome === "home" ? `${match.home.toLowerCase()} ML` : `${match.away.toLowerCase()} ML`,
      lockedOdds: match.odds[outcome],
      stake,
    };
    try {
      // persist server-side (real bankroll enforcement)
      const res = await api<{ pick: ServerPick; bankroll: number }>("/api/picks", {
        method: "POST",
        body,
      });
      setMyPicks((p) => [toUiPick(res.pick), ...p]);
      setBankroll(res.bankroll);
    } catch {
      // offline dev fallback — local only
      setMyPicks((p) => [
        { ...body, id: `local-${Date.now()}`, currentOdds: body.lockedOdds, status: "live", livePnl: 0 },
        ...p,
      ]);
      setBankroll((b) => Math.max(0, b - stake));
    }
    setSlip(null);
  };

  return (
    <>
      {needPass && !joinedTour && (
        <div
          className={ui.card}
          style={{
            marginBottom: 10,
            borderColor: "rgba(108,92,231,0.4)",
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            🔐 this tournament is pass-protected
          </div>
          {passError && (
            <div style={{ color: "var(--tma-error)", fontSize: 11, marginBottom: 6 }}>
              wrong pass — ask your fren again
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className={ui.input}
              placeholder="enter pass from your fren"
              value={passInput}
              onChange={(e) => setPassInput(e.target.value)}
            />
            <button
              className={ui.btnPrimary}
              style={{ width: "auto", whiteSpace: "nowrap" }}
              onClick={() => tryJoin(needPass, passInput)}
            >
              join ⚔️
            </button>
          </div>
        </div>
      )}
      {joinedTour && (
        <div
          className={ui.card}
          style={{
            marginBottom: 10,
            borderColor: "rgba(0,184,148,0.35)",
            background: "rgba(0,184,148,0.08)",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          ⚔️ you&apos;re in — &ldquo;{joinedTour}&rdquo; · your fren is waiting 🫡
          {joinExplorer && (
            <a
              href={joinExplorer}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--tma-primary)",
                marginTop: 6,
                textDecoration: "none",
              }}
            >
              buy-in locked onchain — view on explorer ↗
            </a>
          )}
        </div>
      )}
      <div className={styles.hero}>
        {/* rendered hero art (public/hero-stadium.png) — svg below is the
            instant fallback while it loads / if missing */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-stadium.webp"
          alt=""
          className={styles.heroArtImg}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        {/* mini stadium art */}
        <svg className={styles.heroArt} viewBox="0 0 120 90" aria-hidden>
          <defs>
            <radialGradient id="bowlGlow" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="rgba(168,130,255,0.55)" />
              <stop offset="70%" stopColor="rgba(108,92,231,0.15)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>
          <ellipse cx="60" cy="46" rx="56" ry="34" fill="url(#bowlGlow)" />
          <ellipse cx="60" cy="46" rx="50" ry="28" fill="#0a0a12" stroke="#a882ff" strokeWidth="2.5" opacity="0.95" />
          <ellipse cx="60" cy="46" rx="42" ry="22" fill="#0d0d16" stroke="rgba(168,130,255,0.45)" strokeWidth="1" />
          <ellipse cx="60" cy="46" rx="31" ry="15" fill="#0d4a2e" />
          <ellipse cx="60" cy="46" rx="31" ry="15" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />
          <line x1="60" y1="31" x2="60" y2="61" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />
          <ellipse cx="60" cy="46" rx="6" ry="4" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />
          <rect x="36" y="41" width="7" height="10" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" />
          <rect x="77" y="41" width="7" height="10" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" />
          <text x="60" y="48.5" textAnchor="middle" fontSize="5" fontWeight="800" fill="rgba(255,255,255,0.5)">FP</text>
          {Array.from({ length: 14 }).map((_, i) => {
            const a = (i / 14) * Math.PI * 2;
            return (
              <circle
                key={i}
                cx={60 + Math.cos(a) * 50}
                cy={46 + Math.sin(a) * 28}
                r="0.9"
                fill="#c9b3ff"
                opacity="0.8"
              />
            );
          })}
        </svg>

        <div className={styles.heroContent}>
          <div className={styles.heroBadges}>
            <span className={ui.pillLive}>
              <span className={ui.liveDot} />
              LIVE
            </span>
            <span className={styles.heroVersion}>
              {isLive ? "live feed" : "replay demo"} · v5
            </span>
          </div>
          <h2>gm {user.username} 🫡</h2>
          <p>
            {onlineFrens.length} frens live in the stadium 👥
          </p>
          <p>
            your matchday bankroll:{" "}
            <b className={`${ui.num} ${styles.bankroll}`}>{bankroll} pts</b>
          </p>
        {onlineFrens.length > 0 ? (
          <div className={styles.frensOnline}>
            {onlineFrens.slice(0, 4).map((f, i) => (
              <Avatar
                key={f.id}
                photoUrl={f.photoUrl}
                initial={f.initial}
                gradient={[["#00b894", "#e17055", "#0984e3", "#fd79a8"][i % 4], "#6c5ce7"]}
                size={26}
                fontSize={10}
                className={styles.miniAvatar}
              />
            ))}
            <span>
              {onlineFrens
                .slice(0, 2)
                .map((f) => f.handle)
                .join(", ")}
              {onlineFrens.length > 2 && ` + ${onlineFrens.length - 2} more`} in the
              stadium
            </span>
          </div>
        ) : (
          <div className={styles.frensOnline}>
            <span>no frens in the stadium yet — invite them from a tournament ⚔️</span>
          </div>
        )}
        </div>
      </div>

      {myPicks.length > 0 && (
        <>
          <div className={ui.sectionLabel}>📋 my picks today</div>
          <div className={ui.card} style={{ padding: "6px 14px" }}>
            {myPicks.map((p) => (
              <div key={p.id} className={styles.myPick}>
                <span>
                  {p.matchLabel.split(" vs")[0]} {p.outcomeLabel}{" "}
                  <b className={ui.num}>@ {p.lockedOdds.toFixed(2)}</b> · {p.stake} pts
                </span>
                <span className={styles.pickStatus}>
                  {p.status === "upcoming" ? "upcoming" : p.status === "live" ? "sweating 🔥" : p.status}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className={styles.sectionRow}>
        <span className={styles.sectionTitle}>🔥 HOT ODDS</span>
        <span className={styles.sectionSub}>biggest moves last 10 min</span>
      </div>
      {matches.length === 0 && (
        <div className={ui.emptyState}>loading fixtures from txline…</div>
      )}
      {(showAll ? matches : matches.slice(0, 5)).map((m, i) => (
        <OddsCard key={m.id} match={m} index={i} onPick={(match, outcome) => setSlip({ match, outcome })} />
      ))}
      {matches.length > 5 && !showAll && (
        <button className={ui.btnGhost} onClick={() => setShowAll(true)}>
          view all matches ›
        </button>
      )}

      {slip && (
        <PickSlip
          match={slip.match}
          outcome={slip.outcome}
          bankroll={bankroll}
          onConfirm={confirmPick}
          onClose={() => setSlip(null)}
        />
      )}
    </>
  );
}
