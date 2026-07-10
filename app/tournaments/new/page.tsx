"use client";

import { useMemo, useState } from "react";
import type { PrizeSplit } from "@/app/types";
import { mockFrens } from "@/app/data/mock-frens";
import { api } from "@/app/lib/api";
import ui from "@/app/styles/ui.module.css";
import styles from "./new.module.css";

const BUY_INS = [5, 10, 25, 50];

const SPLITS: { key: PrizeSplit; label: string; parts: number[] }[] = [
  { key: "winner_take_all", label: "winner takes all", parts: [100] },
  { key: "split_70_20_10", label: "70 / 20 / 10", parts: [70, 20, 10] },
  { key: "even_top3", label: "even top 3", parts: [34, 33, 33] },
];

const MEDALS = ["🥇", "🥈", "🥉"];

export default function NewTournamentPage() {
  const [name, setName] = useState("quarterfinals fren war 🏆");
  const [buyIn, setBuyIn] = useState(10);
  const [split, setSplit] = useState<PrizeSplit>("split_70_20_10");
  const [invited, setInvited] = useState<Set<string>>(
    new Set(mockFrens.slice(0, 3).map((f) => f.id))
  );
  const [funded, setFunded] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const pool = buyIn * (invited.size + 1); // + creator
  const splitDef = useMemo(() => SPLITS.find((s) => s.key === split)!, [split]);

  const toggle = (id: string) => {
    setInvited((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fund = async () => {
    // TODO(onchain): escrow program create_tournament — see programs/escrow
    try {
      const res = await api<{ inviteLink: string }>("/api/tournaments", {
        method: "POST",
        body: { name, buyInUsdc: buyIn, split, maxFrens: 8 },
      });
      setInviteLink(res.inviteLink);
    } catch {
      /* offline dev */
    }
    setFunded(true);
  };

  const share = () => {
    if (!inviteLink) return;
    const text = `⚔️ ${name} — ${buyIn} usdc buy-in. tap to join:`;
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(text)}`
    );
  };

  return (
    <>
      <div className={ui.formLabel} style={{ marginTop: 4 }}>
        tournament name
      </div>
      <input
        className={ui.input}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="name your war"
      />

      <div className={ui.formLabel}>buy-in per fren (usdc on solana · devnet)</div>
      <div className={ui.seg}>
        {BUY_INS.map((b) => (
          <button
            key={b}
            className={buyIn === b ? ui.segItemOn : ui.segItem}
            onClick={() => setBuyIn(b)}
          >
            {b}
          </button>
        ))}
      </div>

      <div className={styles.pool}>
        <div>
          <span className={`${styles.poolAmt} ${ui.num}`}>{pool}</span>{" "}
          <span className={styles.poolCur}>USDC</span>
        </div>
        <div className={styles.poolPer}>
          {invited.size + 1} frens × {buyIn} usdc · escrowed onchain 🔐 · auto-payout on
          final whistle
        </div>
      </div>

      <div className={ui.formLabel}>prize split</div>
      <div className={ui.seg}>
        {SPLITS.map((s) => (
          <button
            key={s.key}
            className={split === s.key ? ui.segItemOn : ui.segItem}
            onClick={() => setSplit(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className={styles.splitViz}>
        {splitDef.parts.map((p, i) => (
          <div key={i} className={`${styles.splitBar} ${ui.num}`} style={{ flex: p }}>
            {MEDALS[i]} {Math.round((pool * p) / 100)}
          </div>
        ))}
      </div>

      <div className={ui.formLabel}>invite from contacts</div>
      <div className={ui.card} style={{ padding: "4px 14px" }}>
        {mockFrens.slice(0, 5).map((f) => (
          <button key={f.id} className={styles.inviteRow} onClick={() => toggle(f.id)}>
            <span
              className={`${ui.avatar} ${styles.inviteAvatar}`}
              style={{
                background: `linear-gradient(135deg, ${f.gradient[0]}, ${f.gradient[1]})`,
              }}
            >
              {f.initial}
            </span>
            <span className={styles.inviteName}>{f.handle}</span>
            <span className={invited.has(f.id) ? styles.checkOn : styles.check} />
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {funded ? (
          <>
            <div className={styles.funded}>
              tournament live 🔐 share the invite — frens join in 2 taps
            </div>
            {inviteLink && (
              <button className={ui.btnPrimary} style={{ marginTop: 10 }} onClick={share}>
                📤 send invite link to frens
              </button>
            )}
          </>
        ) : (
          <button className={ui.btnPrimary} onClick={fund}>
            fund {buyIn} usdc + send invites 🔗
          </button>
        )}
        <div className={ui.fairNote}>
          invite link opens the mini app · pass-protected · refund-guaranteed if
          unsettled
        </div>
      </div>
    </>
  );
}
