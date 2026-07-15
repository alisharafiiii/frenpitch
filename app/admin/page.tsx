"use client";

import { useState } from "react";
import { useApi } from "@/app/lib/useApi";
import { api } from "@/app/lib/api";
import styles from "./admin.module.css";
import ui from "@/app/styles/ui.module.css";

/** admin control room — /admin (unlinked; ADMIN_TG_ID gated server-side).
 *  numbers by time and activity + the demo-day levers. */

interface Stats {
  at: number;
  users: { total: number; active24h: number; active7d: number; new24h: number };
  picks: { total: number; open: number; won: number; lost: number; totalStaked: number; openStaked: number };
  tournaments: number;
  days: { day: string; picks: number; staked: number; signups: number }[];
  leaders: { handle: string; pnl: number }[];
}

export default function AdminPage() {
  const { data, refresh } = useApi<Stats>("/api/admin/stats", { intervalMs: 30000 });
  const [matchId, setMatchId] = useState("");
  const [outcome, setOutcome] = useState<"home" | "draw" | "away">("home");
  const [report, setReport] = useState("");
  const [busy, setBusy] = useState(false);

  const settleNow = async () => {
    setBusy(true);
    try {
      const r = await api<Record<string, unknown>>("/api/settle");
      setReport(JSON.stringify(r));
      refresh();
    } catch (e) {
      setReport(String(e));
    }
    setBusy(false);
  };

  const forceResult = async () => {
    if (!matchId) return;
    setBusy(true);
    try {
      const r = await api<Record<string, unknown>>("/api/settle", {
        method: "POST",
        body: { matchId, outcome },
      });
      setReport(JSON.stringify(r));
      refresh();
    } catch (e) {
      setReport(String(e));
    }
    setBusy(false);
  };

  if (!data) {
    return <div className={styles.denied}>checking clearance…</div>;
  }

  const maxPicks = Math.max(1, ...data.days.map((d) => d.picks));

  return (
    <>
      <div className={styles.head}>
        <span className={styles.title}>control room</span>
        <span className={styles.stamp}>
          {new Date(data.at).toISOString().slice(11, 19)} utc
        </span>
      </div>

      {/* tiles */}
      <div className={styles.tiles}>
        <div className={styles.tile}>
          <div className={`${styles.tileValue} ${ui.num}`}>{data.users.total}</div>
          <div className={styles.tileLabel}>frens</div>
          <div className={styles.tileSub}>
            <span className={styles.up}>+{data.users.new24h}</span> last 24h
          </div>
        </div>
        <div className={styles.tile} style={{ animationDelay: "0.05s" }}>
          <div className={`${styles.tileValue} ${ui.num}`}>{data.users.active24h}</div>
          <div className={styles.tileLabel}>active 24h</div>
          <div className={styles.tileSub}>{data.users.active7d} in 7d</div>
        </div>
        <div className={styles.tile} style={{ animationDelay: "0.1s" }}>
          <div className={`${styles.tileValue} ${ui.num}`}>{data.picks.total}</div>
          <div className={styles.tileLabel}>picks</div>
          <div className={styles.tileSub}>
            {data.picks.open} open · {data.picks.won}W {data.picks.lost}L
          </div>
        </div>
        <div className={styles.tile} style={{ animationDelay: "0.15s" }}>
          <div className={`${styles.tileValue} ${ui.num}`}>
            {data.picks.totalStaked.toLocaleString()}
          </div>
          <div className={styles.tileLabel}>points staked</div>
          <div className={styles.tileSub}>
            {data.picks.openStaked.toLocaleString()} riding · {data.tournaments} tours
          </div>
        </div>
      </div>

      {/* 7-day activity */}
      <div className={styles.secHead}>LAST 7 DAYS</div>
      <div className={styles.chartCard}>
        <div className={styles.bars}>
          {data.days.map((d) => (
            <div key={d.day} className={styles.barCol}>
              <span className={`${styles.barVal} ${ui.num}`}>{d.picks || ""}</span>
              <div className={styles.barStack}>
                <div
                  className={styles.barPicks}
                  style={{ height: `${(d.picks / maxPicks) * 100}%` }}
                />
                {d.signups > 0 && (
                  <div className={styles.barSign} style={{ height: `${Math.min(24, d.signups * 4)}px` }} />
                )}
              </div>
              <span className={styles.barDay}>{d.day.slice(3)}</span>
            </div>
          ))}
        </div>
        <div className={styles.legend}>
          <span><span className={styles.dotP} />picks</span>
          <span><span className={styles.dotS} />signups</span>
        </div>
      </div>

      {/* pnl leaders */}
      <div className={styles.secHead}>PNL LEADERS</div>
      <div className={styles.listCard}>
        {data.leaders.map((l, i) => (
          <div key={l.handle} className={styles.leadRow}>
            <span className={`${styles.leadRank} ${ui.num}`}>{i + 1}</span>
            {l.handle}
            <span
              className={`${styles.leadPnl} ${ui.num}`}
              style={{ color: l.pnl >= 0 ? "#34d399" : "#f87171" }}
            >
              {l.pnl >= 0 ? "+" : ""}
              {l.pnl.toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      {/* levers */}
      <div className={styles.secHead}>CONTROLS</div>
      <div className={styles.ctrlCard}>
        <div className={styles.ctrlRow}>
          <input
            className={styles.input}
            placeholder="match id"
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
          />
          <select
            className={styles.select}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as typeof outcome)}
          >
            <option value="home">home</option>
            <option value="draw">draw</option>
            <option value="away">away</option>
          </select>
          <button className={styles.btn} disabled={busy || !matchId} onClick={forceResult}>
            force
          </button>
        </div>
        <button className={styles.btnGhost} disabled={busy} onClick={settleNow}>
          run settlement now
        </button>
        {report && <div className={styles.report}>{report}</div>}
      </div>
    </>
  );
}
