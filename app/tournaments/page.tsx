"use client";

import { useState } from "react";
import { useEffect } from "react";
import Link from "next/link";
import { api } from "@/app/lib/api";
import { useApi } from "@/app/lib/useApi";
import { shareToContacts } from "@/app/lib/telegram";
import { Avatar } from "@/app/components/Avatar";
import ui from "@/app/styles/ui.module.css";

interface TourMember {
  id: string;
  username: string;
  initial: string;
  photoUrl: string;
  pnl: number;
  streak: number;
  online: boolean;
  isCreator: boolean;
}

interface TourDetail {
  tournament: { onchainPool: number | null };
  members: TourMember[];
}

const MEMBER_GRADS: [string, string][] = [
  ["#fdcb6e", "#e17055"],
  ["#b2bec3", "#636e72"],
  ["#e17055", "#d63031"],
  ["#6c5ce7", "#a29bfe"],
  ["#00b894", "#55efc4"],
];

interface MyTournament {
  code: string;
  name: string;
  buyInUsdc: number;
  split: string;
  status: string;
  maxFrens: number;
  memberCount: number;
  pool: number;
  hasPass: boolean;
  isCreator: boolean;
}

const SPLIT_LABEL: Record<string, string> = {
  winner_take_all: "winner takes all",
  split_70_20_10: "70/20/10",
  even_top3: "even top 3",
};

export default function TournamentsPage() {
  const [tours, setTours] = useState<MyTournament[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinPass, setJoinPass] = useState("");
  const [needPass, setNeedPass] = useState(false);
  const [joinMsg, setJoinMsg] = useState<string | null>(null);

  // cached → instant on tab return
  const { data: mineData, refresh: load } = useApi<{ tournaments: MyTournament[] }>(
    "/api/tournaments/mine"
  );
  useEffect(() => {
    if (mineData) {
      setTours(mineData.tournaments);
      setLoaded(true);
    }
    const t = setTimeout(() => setLoaded(true), 2500); // fallback for offline
    return () => clearTimeout(t);
  }, [mineData]);

  const join = async () => {
    const code = joinCode.trim().toLowerCase();
    if (!code) return;
    try {
      await api("/api/tournaments", {
        method: "PUT",
        body: { code, pass: joinPass || undefined },
      });
      // fund the buy-in from the invisible devnet wallet
      api("/api/tournaments/fund", { method: "POST", body: { code } }).catch(() => {});
      setJoinMsg("you're in ⚔️");
      setNeedPass(false);
      void load();
    } catch (err) {
      if (err instanceof Error && err.message === "pass_required") {
        setNeedPass(true);
        setJoinMsg("this tour needs a pass 🔐");
      } else {
        setJoinMsg("code not found or tour is full");
      }
    }
  };

  const share = (t: MyTournament) =>
    shareToContacts(
      `https://t.me/frenpitch_bot/app?startapp=${t.code}`,
      `⚔️ ${t.name} — ${t.buyInUsdc} usdc buy-in.${t.hasPass ? " pass-protected 🔐" : ""} tap to join:`
    );

  // tap a tour → expand with members + leaderboard
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, TourDetail>>({});

  const toggleDetail = (code: string) => {
    if (expanded === code) {
      setExpanded(null);
      return;
    }
    setExpanded(code);
    api<TourDetail>(`/api/tournaments?code=${code}`)
      .then((d) => setDetails((prev) => ({ ...prev, [code]: d })))
      .catch(() => {});
  };

  return (
    <>
      <div className={ui.sectionLabel}>⚔️ join with code</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className={ui.input}
          placeholder="paste code from your fren"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
        />
        <button
          className={ui.btnPrimary}
          style={{ width: "auto", whiteSpace: "nowrap" }}
          onClick={join}
        >
          join
        </button>
      </div>
      {needPass && (
        <input
          className={ui.input}
          style={{ marginTop: 8 }}
          placeholder="🔐 passcode"
          value={joinPass}
          onChange={(e) => setJoinPass(e.target.value)}
        />
      )}
      {joinMsg && (
        <div style={{ fontSize: 12, color: "var(--tma-fg-dim)", marginTop: 8 }}>{joinMsg}</div>
      )}

      <div className={ui.sectionLabel}>🏆 your tournaments</div>

      {loaded && tours.length === 0 && (
        <div className={ui.emptyState}>
          no tournaments yet — create one and drag your frens in ⚔️
        </div>
      )}

      {tours.map((t) => (
        <div
          key={t.code}
          className={ui.card}
          style={{ marginBottom: 10, cursor: "pointer" }}
          onClick={() => toggleDetail(t.code)}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>
              {t.name} {t.hasPass && "🔐"}
            </div>
            <span className={t.status === "open" ? ui.pillSoon : ui.pillLive}>
              {t.status} {expanded === t.code ? "▲" : "▼"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--tma-fg-dim)", margin: "6px 0 10px" }}>
            <b className={ui.num} style={{ color: "var(--tma-success)", fontSize: 16 }}>
              {t.pool} usdc
            </b>{" "}
            live pool · {t.memberCount}/{t.maxFrens} frens joined · {t.buyInUsdc} usdc
            buy-in · {SPLIT_LABEL[t.split] ?? t.split}
            <div style={{ marginTop: 4, userSelect: "all" }}>
              code: <b className={ui.num}>{t.code}</b> — frens can join with it directly
            </div>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: "var(--tma-bg-elevated)",
              overflow: "hidden",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(t.memberCount / t.maxFrens) * 100}%`,
                borderRadius: 3,
                background: "linear-gradient(90deg, var(--tma-primary), var(--tma-success))",
                transition: "width 0.5s ease",
              }}
            />
          </div>
          {expanded === t.code && (
            <div style={{ marginBottom: 10 }} onClick={(e) => e.stopPropagation()}>
              <div className={ui.sectionLabel} style={{ margin: "4px 0 8px" }}>
                🏅 leaderboard
              </div>
              {!details[t.code] && (
                <div className={ui.emptyState} style={{ padding: "10px" }}>
                  loading frens…
                </div>
              )}
              {details[t.code]?.members.map((m, i) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom: "1px solid var(--tma-border)",
                  }}
                >
                  <span
                    className={ui.num}
                    style={{ width: 18, fontWeight: 800, fontSize: 12, color: "var(--tma-fg-muted)" }}
                  >
                    {i + 1}
                  </span>
                  <Avatar
                    photoUrl={m.photoUrl}
                    initial={m.initial}
                    gradient={MEMBER_GRADS[i % MEMBER_GRADS.length]}
                    size={32}
                    fontSize={12}
                  />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>
                    {m.username} {m.isCreator && "👑"} {i === 0 && m.pnl > 0 && "🔥"}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: m.online ? "var(--tma-success)" : "var(--tma-fg-muted)",
                    }}
                  >
                    {m.online ? "● online" : "○ away"}
                  </span>
                  <b
                    className={`${ui.num} ${m.pnl >= 0 ? ui.pos : ui.neg}`}
                    style={{ fontSize: 13, minWidth: 48, textAlign: "right" }}
                  >
                    {m.pnl >= 0 ? "+" : ""}
                    {m.pnl}
                  </b>
                </div>
              ))}
              {details[t.code]?.tournament.onchainPool !== null &&
                details[t.code] !== undefined && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--tma-success)",
                      marginTop: 8,
                      fontWeight: 700,
                    }}
                  >
                    🔐 {details[t.code].tournament.onchainPool} usdc locked onchain (devnet)
                  </div>
                )}
            </div>
          )}
          {t.status === "open" && (
            <button
              className={ui.btnGhost}
              onClick={(e) => {
                e.stopPropagation();
                share(t);
              }}
            >
              📤 invite more frens ({t.maxFrens - t.memberCount} spots left)
            </button>
          )}
        </div>
      ))}

      <Link
        href="/tournaments/new"
        className={ui.btnPrimary}
        style={{ textAlign: "center", textDecoration: "none", display: "block", marginTop: 6 }}
      >
        ⚔️ create tournament
      </Link>
    </>
  );
}
