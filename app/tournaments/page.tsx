"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/app/lib/api";
import { shareToContacts } from "@/app/lib/telegram";
import ui from "@/app/styles/ui.module.css";

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

  const load = () =>
    api<{ tournaments: MyTournament[] }>("/api/tournaments/mine")
      .then(({ tournaments }) => {
        setTours(tournaments);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));

  useEffect(() => {
    void load();
  }, []);

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
        <div key={t.code} className={ui.card} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>
              {t.name} {t.hasPass && "🔐"}
            </div>
            <span className={t.status === "open" ? ui.pillSoon : ui.pillLive}>
              {t.status}
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
          {t.status === "open" && (
            <button className={ui.btnGhost} onClick={() => share(t)}>
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
