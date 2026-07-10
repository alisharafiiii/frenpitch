"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/app/lib/api";
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

  useEffect(() => {
    api<{ tournaments: MyTournament[] }>("/api/tournaments/mine")
      .then(({ tournaments }) => {
        setTours(tournaments);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const share = (t: MyTournament) => {
    const url = `https://t.me/frenpitch_bot?startapp=${t.code}`;
    const text = `⚔️ ${t.name} — ${t.buyInUsdc} usdc buy-in.${t.hasPass ? " pass-protected 🔐" : ""} tap to join:`;
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
    );
  };

  return (
    <>
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
