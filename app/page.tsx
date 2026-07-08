"use client";

import { useEffect, useMemo, useState } from "react";
import type { Match, MatchEvent, Outcome, Pick } from "@/app/types";
import { mockMatches } from "@/app/data/mock-matches";
import { mockFrens } from "@/app/data/mock-frens";
import { bus } from "@/app/lib/events";
import { TxLineClient } from "@/app/lib/txline";
import { getTgUser } from "@/app/lib/telegram";
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

  // wire the replay feed → live odds/score updates
  useEffect(() => {
    const client = new TxLineClient("replay", 10);
    client.connect();
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

  const confirmPick = (stake: number) => {
    if (!slip) return;
    const { match, outcome } = slip;
    const pick: Pick = {
      id: `mine-${Date.now()}`,
      matchId: match.id,
      matchLabel: `${match.homeFlag} ${match.home.toLowerCase()} vs ${match.away.toLowerCase()}`,
      outcome,
      outcomeLabel:
        outcome === "draw" ? "draw" : outcome === "home" ? `${match.home.toLowerCase()} ML` : `${match.away.toLowerCase()} ML`,
      lockedOdds: match.odds[outcome],
      currentOdds: match.odds[outcome],
      stake,
      status: match.status === "upcoming" ? "upcoming" : "live",
      livePnl: 0,
    };
    setMyPicks((p) => [pick, ...p]);
    setBankroll((b) => Math.max(0, b - stake));
    setSlip(null);
  };

  return (
    <>
      <div className={styles.hero}>
        <h2>gm {user.username} 🫡</h2>
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
