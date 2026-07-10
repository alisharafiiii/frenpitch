"use client";

import { useEffect, useMemo, useState } from "react";
import type { Match, MatchEvent, Outcome, Pick } from "@/app/types";
import { mockMatches } from "@/app/data/mock-matches";
import { mockFrens } from "@/app/data/mock-frens";
import { bus } from "@/app/lib/events";
import { TxLineClient } from "@/app/lib/txline";
import { getTgUser } from "@/app/lib/telegram";
import { api, startParam } from "@/app/lib/api";

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
import ui from "@/app/styles/ui.module.css";
import styles from "./home.module.css";

export default function HomePage() {
  const user = useMemo(() => getTgUser(), []);
  const [matches, setMatches] = useState<Match[]>(mockMatches);
  const [bankroll, setBankroll] = useState(720);
  const [myPicks, setMyPicks] = useState<Pick[]>([]);
  const [slip, setSlip] = useState<{ match: Match; outcome: Outcome } | null>(null);

  const [isLive, setIsLive] = useState(false);

  const [joinedTour, setJoinedTour] = useState<string | null>(null);

  // real account: login-or-signup via tg identity, load bankroll + picks.
  // if opened via an invite link (t.me/...?startapp=CODE) → join that
  // tournament first thing, like the minted mind pass flow
  useEffect(() => {
    api<{ user: { bankroll: number }; picks: ServerPick[] }>("/api/me")
      .then(({ user: u, picks }) => {
        setBankroll(u.bankroll);
        setMyPicks(picks.map(toUiPick));
      })
      .catch(() => {
        /* offline dev — keep local defaults */
      });

    const code = startParam();
    if (code) {
      api<{ joined: boolean }>("/api/tournaments", { method: "PUT", body: { code } })
        .then(() =>
          api<{ tournament: { name: string } }>(`/api/tournaments?code=${code}`).then((t) =>
            setJoinedTour(t.tournament.name)
          )
        )
        .catch(() => {
          /* invalid or full code — ignore */
        });
    }
  }, []);

  // auto feed: real txline stream when the key works, replay otherwise
  useEffect(() => {
    const client = new TxLineClient("auto", 10);
    client.connect().then(({ live, matches: fixtures }) => {
      setIsLive(live);
      if (live && fixtures.length > 0) setMatches(fixtures);
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

  const onlineFrens = mockFrens.filter((f) => f.online);

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
        </div>
      )}
      <div className={styles.hero}>
        <h2>
          gm {user.username} 🫡{" "}
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--tma-fg-dim)" }}>
            {isLive ? "· live feed" : "· replay demo"}
          </span>
        </h2>
        <p>
          {onlineFrens.length} frens live in the stadium · your matchday bankroll:{" "}
          <b className={ui.num}>{bankroll} pts</b>
        </p>
        <div className={styles.frensOnline}>
          {onlineFrens.slice(0, 4).map((f) => (
            <div
              key={f.id}
              className={`${ui.avatar} ${styles.miniAvatar}`}
              style={{
                background: `linear-gradient(135deg, ${f.gradient[0]}, ${f.gradient[1]})`,
              }}
            >
              {f.initial}
            </div>
          ))}
          <span>
            {onlineFrens
              .slice(0, 2)
              .map((f) => f.handle)
              .join(", ")}{" "}
            + {Math.max(0, onlineFrens.length - 2)} sweating live picks
          </span>
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

      <div className={ui.sectionLabel}>🔥 hot odds — biggest moves last 10 min</div>
      {matches.map((m, i) => (
        <OddsCard key={m.id} match={m} index={i} onPick={(match, outcome) => setSlip({ match, outcome })} />
      ))}

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
