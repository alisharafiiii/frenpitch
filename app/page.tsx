"use client";

import { useEffect, useMemo, useState } from "react";
import type { Match, MatchEvent, Pick, PickOutcome } from "@/app/types";
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
  outcome: PickOutcome;
  outcomeLabel: string;
  market?: "1x2" | "totals";
  line?: number;
  lockedOdds: number;
  stake: number;
  status: "open" | "won" | "lost" | "push";
  createdAt?: number;
}

/** "today" = still open (sweating) or placed since local midnight.
 *  settled picks from previous days live in the profile history. */
function isTodayPick(p: ServerPick): boolean {
  if (p.status === "open") return true;
  if (!p.createdAt) return false;
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return p.createdAt >= midnight.getTime();
}

function toUiPick(p: ServerPick): Pick {
  return {
    ...p,
    currentOdds: p.lockedOdds,
    status: p.status === "open" ? "live" : p.status,
    livePnl: 0,
  };
}
import { OddsCard, type Selection } from "./components/odds/OddsCard";
import { PickSlip } from "./components/slip/PickSlip";
import { Avatar } from "./components/Avatar";
import { IconFire } from "./components/icons";
import ui from "@/app/styles/ui.module.css";
import styles from "./home.module.css";

export default function HomePage() {
  const user = useTgUser();
  const [matches, setMatches] = useState<Match[]>([]);
  const [bankroll, setBankroll] = useState(720);
  const [myPicks, setMyPicks] = useState<Pick[]>([]);
  const [slip, setSlip] = useState<{ match: Match; sel: Selection } | null>(null);

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
      setMyPicks(meData.picks.filter(isTodayPick).map(toUiPick));
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
          if (e.probs) next.probs = e.probs;
          // totals line moves stream too — keep the same line, refresh prices
          if (e.totals && (!next.totals || e.totals.line === next.totals.line)) {
            next.totals = e.totals;
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
      hasPhoto?: boolean;
      online: boolean;
      livePick: unknown;
    }[];
  }>("/api/stadium", { intervalMs: 30000 });

  const onlineFrens = useMemo(
    () =>
      (stadiumData?.frens ?? [])
        .filter((f) => f.online && f.id !== String(user.id)) // frens only, not you
        .sort(
          (a, b) => Number(b.hasPhoto ?? false) - Number(a.hasPhoto ?? false)
        ) // real pfps front of the stack
        .map((f) => ({
          id: f.id,
          handle: f.handle,
          initial: f.initial,
          photoUrl: f.photoUrl,
          live: !!f.livePick,
        })),
    [stadiumData, user.id]
  );

  const confirmPick = async (stake: number) => {
    if (!slip) return;
    const { match, sel } = slip;
    const isTotals = sel.market === "totals";
    const lockedOdds = isTotals
      ? sel.outcome === "over"
        ? (match.totals?.over ?? 0)
        : (match.totals?.under ?? 0)
      : match.odds[sel.outcome as "home" | "draw" | "away"];
    const body = {
      matchId: match.id,
      matchLabel: `${match.homeFlag} ${match.home.toLowerCase()} vs ${match.away.toLowerCase()}`,
      outcome: sel.outcome,
      outcomeLabel: isTotals
        ? `${sel.outcome} ${match.totals?.line} goals`
        : sel.outcome === "draw"
          ? "draw"
          : sel.outcome === "home"
            ? `${match.home.toLowerCase()} ML`
            : `${match.away.toLowerCase()} ML`,
      market: sel.market,
      ...(isTotals ? { line: match.totals?.line } : {}),
      lockedOdds,
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
        {/* full-bleed hero art (public/hero-stadium.webp) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hero-stadium.webp" alt="" className={styles.heroArtImg} />

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
          <h2>gm {user.username}</h2>
          <p>
            {onlineFrens.length} frens live in the stadium
          </p>
          <p>
            your matchday bankroll:{" "}
            <b className={`${ui.num} ${styles.bankroll}`}>{bankroll} pts</b>
          </p>
        {onlineFrens.length > 0 ? (
          <div className={styles.frensOnline}>
            {onlineFrens.slice(0, 3).map((f, i) => (
              <Avatar
                key={f.id}
                photoUrl={f.photoUrl}
                initial={f.initial}
                gradient={[["#00b894", "#e17055", "#0984e3"][i % 3], "#6c5ce7"]}
                size={40}
                fontSize={15}
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
                <span
                  className={styles.pickStatus}
                  style={
                    p.status === "won"
                      ? { color: "var(--tma-success)" }
                      : p.status === "lost"
                        ? { color: "var(--tma-error)" }
                        : undefined
                  }
                >
                  {p.status === "upcoming"
                    ? "upcoming"
                    : p.status === "live"
                      ? "sweating 🔥"
                      : p.status === "won"
                        ? "won ✅"
                        : p.status === "push"
                          ? "push ↩"
                          : "lost ❌"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className={styles.sectionRow}>
        <span className={styles.sectionTitle} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <IconFire size={17} /> HOT ODDS
        </span>
        <span className={styles.sectionSub}>biggest moves last 10 min</span>
      </div>
      {matches.length === 0 &&
        [0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={ui.skeleton}
            style={{ height: 84, borderRadius: 16, marginBottom: 10 }}
          />
        ))}
      {(showAll ? matches : matches.slice(0, 5)).map((m, i) => (
        <OddsCard key={m.id} match={m} index={i} onPick={(match, sel) => setSlip({ match, sel })} />
      ))}
      {matches.length > 5 && !showAll && (
        <button className={ui.btnGhost} onClick={() => setShowAll(true)}>
          view all matches ›
        </button>
      )}

      {slip && (
        <PickSlip
          match={slip.match}
          sel={slip.sel}
          bankroll={bankroll}
          onConfirm={confirmPick}
          onClose={() => setSlip(null)}
        />
      )}
    </>
  );
}
