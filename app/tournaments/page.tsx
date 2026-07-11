"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/app/lib/api";
import { useApi } from "@/app/lib/useApi";
import { shareToContacts } from "@/app/lib/telegram";
import { Avatar } from "@/app/components/Avatar";
import {
  IconArrowRight,
  IconBag,
  IconCoins,
  IconLock,
  IconQr,
  IconSplit,
  IconTrophy,
  IconUsers,
} from "@/app/components/icons";
import ui from "@/app/styles/ui.module.css";
import styles from "./tours.module.css";

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

const SPLIT_LABEL: Record<string, string> = {
  winner_take_all: "100/0/0",
  split_70_20_10: "70/20/10",
  even_top3: "34/33/33",
};

/** card themes rotate: purple → green → gold (matches the cup art) */
const THEMES = [
  { key: "purple", color: "#8b7ff5", glow: "rgba(124, 111, 240, 0.45)" },
  { key: "green", color: "#34d399", glow: "rgba(34, 197, 94, 0.4)" },
  { key: "gold", color: "#f0b429", glow: "rgba(240, 180, 41, 0.4)" },
];

const MEMBER_GRADS: [string, string][] = [
  ["#fdcb6e", "#e17055"],
  ["#b2bec3", "#636e72"],
  ["#e17055", "#d63031"],
  ["#6c5ce7", "#a29bfe"],
  ["#00b894", "#55efc4"],
];

export default function TournamentsPage() {
  const [tours, setTours] = useState<MyTournament[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<"active" | "settled">("active");
  const [joinCode, setJoinCode] = useState("");
  const [joinPass, setJoinPass] = useState("");
  const [needPass, setNeedPass] = useState(false);
  const [joinMsg, setJoinMsg] = useState<string | null>(null);

  const { data: mineData, refresh: load } = useApi<{ tournaments: MyTournament[] }>(
    "/api/tournaments/mine"
  );
  useEffect(() => {
    if (mineData) {
      setTours(mineData.tournaments);
      setLoaded(true);
    }
    const t = setTimeout(() => setLoaded(true), 2500);
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

  // expand + settle
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, TourDetail>>({});
  const [settling, setSettling] = useState<string | null>(null);
  const [settleResult, setSettleResult] = useState<string | null>(null);
  const [settleExplorer, setSettleExplorer] = useState<string | null>(null);

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

  const visible = tours.filter((t) =>
    filter === "active" ? t.status === "open" : t.status !== "open"
  );

  return (
    <>
      {/* stadium banner */}
      <div className={styles.banner}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tours-banner.webp" alt="" className={styles.bannerImg} />
        <div className={styles.bannerText}>
          <div className={styles.bannerKicker}>JOIN THE STADIUM</div>
          <div className={styles.bannerTitle}>WITH A CODE</div>
        </div>
      </div>

      {/* join with code */}
      <div className={styles.joinRow}>
        <div className={styles.joinInputWrap}>
          <input
            className={styles.joinInput}
            placeholder="paste code from your fren"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
          <span className={styles.joinQr}>
            <IconQr />
          </span>
        </div>
        <button className={styles.joinBtn} onClick={join}>
          JOIN
        </button>
      </div>
      {needPass && (
        <input
          className={styles.joinInput}
          style={{ marginTop: 8 }}
          placeholder="passcode"
          value={joinPass}
          onChange={(e) => setJoinPass(e.target.value)}
        />
      )}
      {joinMsg && (
        <div style={{ fontSize: 12, color: "var(--tma-fg-dim)", marginTop: 8 }}>{joinMsg}</div>
      )}

      {/* section header */}
      <div className={styles.sectionRow}>
        <span className={styles.sectionTitle}>
          <IconTrophy size={18} color="#8b7ff5" /> YOUR TOURNAMENTS
        </span>
        <button
          className={styles.filterBtn}
          onClick={() => setFilter(filter === "active" ? "settled" : "active")}
        >
          {filter === "active" ? "Active" : "Settled"} ▾
        </button>
      </div>

      {loaded && visible.length === 0 && (
        <div className={ui.emptyState}>
          {filter === "active"
            ? "no tournaments yet — create one and drag your frens in ⚔️"
            : "nothing settled yet"}
        </div>
      )}

      {visible.map((t, i) => {
        const theme = THEMES[i % THEMES.length];
        const pct = Math.round((t.memberCount / t.maxFrens) * 100);
        const isOpen = t.status === "open";
        return (
          <div
            key={t.code}
            className={styles.card}
            style={{ ["--theme" as string]: theme.color, ["--cup-glow" as string]: theme.glow }}
          >
            <div className={styles.cardTop}>
              <span className={isOpen ? styles.openPill : styles.settledPill}>
                {isOpen ? "OPEN" : "SETTLED"}
              </span>
              <button
                className={`${styles.arrowBtn} ${expanded === t.code ? styles.arrowBtnOpen : ""}`}
                onClick={() => toggleDetail(t.code)}
                aria-label="details"
              >
                <IconArrowRight />
              </button>
            </div>

            <div className={styles.cardBody}>
              <div className={styles.cup}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/cup-${theme.key}.webp`}
                  alt=""
                  className={styles.cupImg}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                <IconTrophy size={44} color={theme.color} />
              </div>

              <div className={styles.cardMain}>
                <div className={styles.cardTitle}>
                  {t.name}
                  {t.hasPass && <IconLock color="var(--tma-fg-dim)" />}
                </div>

                <div className={styles.stats}>
                  <div className={styles.stat}>
                    <div className={styles.statValue}>
                      <IconCoins color="#34d399" /> {t.pool}
                    </div>
                    <div className={styles.statLabel}>LIVE POOL</div>
                  </div>
                  <div className={styles.stat}>
                    <div className={styles.statValue}>
                      <IconUsers color={theme.color} /> {t.memberCount}/{t.maxFrens}
                    </div>
                    <div className={styles.statLabel}>FRENS JOINED</div>
                  </div>
                  <div className={styles.stat}>
                    <div className={styles.statValue}>
                      <IconBag color="#f0b429" /> {t.buyInUsdc}
                    </div>
                    <div className={styles.statLabel}>BUY-IN</div>
                  </div>
                  <div className={styles.stat}>
                    <div className={styles.statValue}>
                      <IconSplit color="#60a5fa" /> {SPLIT_LABEL[t.split] ?? t.split}
                    </div>
                    <div className={styles.statLabel}>PRIZE SPLIT</div>
                  </div>
                </div>

                <div className={styles.codeLine}>
                  code:{" "}
                  <span className={styles.codeValue} style={{ color: theme.color }}>
                    {t.code}
                  </span>{" "}
                  — frens can join with it directly
                </div>
              </div>
            </div>

            <div className={styles.progressRow}>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${pct}%` }} />
              </div>
              <div className={styles.filled}>
                {pct}%<small>FILLED</small>
              </div>
            </div>

            {expanded === t.code && (
              <div style={{ marginBottom: 10 }}>
                <div className={ui.sectionLabel} style={{ margin: "4px 0 8px" }}>
                  leaderboard
                </div>
                {!details[t.code] && (
                  <div className={ui.emptyState} style={{ padding: 10 }}>
                    loading frens…
                  </div>
                )}
                {details[t.code]?.members.map((m, mi) => (
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
                      {mi + 1}
                    </span>
                    <Avatar
                      photoUrl={m.photoUrl}
                      initial={m.initial}
                      gradient={MEMBER_GRADS[mi % MEMBER_GRADS.length]}
                      size={32}
                      fontSize={12}
                    />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>
                      {m.username} {m.isCreator && "👑"} {mi === 0 && m.pnl > 0 && "🔥"}
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
                {details[t.code]?.tournament.onchainPool !== null && details[t.code] !== undefined && (
                  <div style={{ fontSize: 11, color: "var(--tma-success)", marginTop: 8, fontWeight: 700 }}>
                    🔐 {details[t.code].tournament.onchainPool} usdc locked onchain (devnet)
                  </div>
                )}
                {isOpen && t.isCreator && t.memberCount >= 2 && (
                  <button
                    className={ui.btnPrimary}
                    style={{ marginTop: 10 }}
                    disabled={settling === t.code}
                    onClick={async () => {
                      setSettling(t.code);
                      try {
                        const res = await api<{
                          explorer: string;
                          winners: { username: string; amountUsdc: number }[];
                        }>("/api/tournaments/settle", { method: "POST", body: { code: t.code } });
                        setSettleResult(
                          `paid out: ${res.winners.map((w) => `${w.username} ${w.amountUsdc} usdc`).join(" · ")}`
                        );
                        setSettleExplorer(res.explorer);
                        void load();
                      } catch (err) {
                        setSettleResult(err instanceof Error ? err.message : "settle failed");
                      }
                      setSettling(null);
                    }}
                  >
                    {settling === t.code ? "paying out onchain…" : "🏁 settle & pay out the pool"}
                  </button>
                )}
                {settleResult && (
                  <div style={{ fontSize: 11, color: "var(--tma-success)", marginTop: 8, fontWeight: 700 }}>
                    {settleResult}{" "}
                    {settleExplorer && (
                      <a href={settleExplorer} target="_blank" rel="noreferrer" style={{ color: "var(--tma-primary)" }}>
                        view tx ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {isOpen && (
              <button className={styles.inviteBtn} onClick={() => share(t)}>
                <IconUsers size={16} /> invite more frens ({t.maxFrens - t.memberCount} spots left)
              </button>
            )}
          </div>
        );
      })}

      <Link href="/tournaments/new" className={styles.createBtn}>
        <IconTrophy size={18} color="#fff" /> CREATE TOURNAMENT
      </Link>
    </>
  );
}
