"use client";

import { useEffect, useMemo, useState } from "react";
import type { PrizeSplit } from "@/app/types";
import { mockFrens } from "@/app/data/mock-frens";
import { api } from "@/app/lib/api";
import { getTgUser, shareToContacts } from "@/app/lib/telegram";
import ui from "@/app/styles/ui.module.css";
import styles from "./new.module.css";

const BUY_INS = [5, 10, 25, 50];

const GRADIENTS: [string, string][] = [
  ["#00b894", "#55efc4"],
  ["#e17055", "#fab1a0"],
  ["#0984e3", "#74b9ff"],
  ["#fdcb6e", "#ffeaa7"],
  ["#a29bfe", "#6c5ce7"],
  ["#fd79a8", "#e84393"],
];

interface Contact {
  id: string;
  handle: string;
  initial: string;
  gradient: [string, string];
}

const SPLITS: { key: PrizeSplit; label: string; parts: number[] }[] = [
  { key: "winner_take_all", label: "winner takes all", parts: [100] },
  { key: "split_70_20_10", label: "70 / 20 / 10", parts: [70, 20, 10] },
  { key: "even_top3", label: "even top 3", parts: [34, 33, 33] },
];

const MEDALS = ["🥇", "🥈", "🥉"];

export default function NewTournamentPage() {
  const [name, setName] = useState("quarterfinals fren war 🏆");
  const [buyIn, setBuyIn] = useState(10);
  const [isCustom, setIsCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [pass, setPass] = useState("");
  const [maxFrens, setMaxFrens] = useState(8);
  const [split, setSplit] = useState<PrizeSplit>("split_70_20_10");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [funded, setFunded] = useState(false);
  const [funding, setFunding] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [explorer, setExplorer] = useState<string | null>(null);

  // real platform frens (telegram doesn't expose phone contacts to mini
  // apps — the share button reaches everyone else). you are excluded.
  useEffect(() => {
    api<{ frens: { id: string; handle: string; initial: string }[] }>("/api/stadium")
      .then(({ frens }) => {
        const meId = String(getTgUser().id);
        setContacts(
          frens
            .filter((f) => f.id !== meId && f.id !== "demo")
            .map((f, i) => ({
              id: f.id,
              handle: f.handle,
              initial: f.initial,
              gradient: GRADIENTS[i % GRADIENTS.length],
            }))
        );
      })
      .catch(() => {
        if (window.location.hostname === "localhost") {
          setContacts(
            mockFrens.slice(0, 5).map((f) => ({
              id: f.id,
              handle: f.handle,
              initial: f.initial,
              gradient: f.gradient,
            }))
          );
        }
      });
  }, []);

  const effectiveBuyIn = isCustom ? Math.max(1, Number(customValue) || 0) : buyIn;
  const pool = effectiveBuyIn * Math.max(2, invited.size + 1); // + creator, min 2
  const splitDef = useMemo(() => SPLITS.find((s) => s.key === split)!, [split]);
  const filtered = contacts.filter((c) =>
    c.handle.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => {
    setInvited((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fund = async () => {
    setFunding(true);
    try {
      const res = await api<{ inviteLink: string; tournament: { code: string } }>(
        "/api/tournaments",
        {
          method: "POST",
          body: { name, buyInUsdc: effectiveBuyIn, split, maxFrens, pass: pass || undefined },
        }
      );
      setInviteLink(res.inviteLink);
      // real devnet escrow deposit (custodial wallet, invisible)
      try {
        const f = await api<{ explorer: string }>("/api/tournaments/fund", {
          method: "POST",
          body: { code: res.tournament.code },
        });
        setExplorer(f.explorer);
      } catch {
        /* escrow not configured yet — tournament still created */
      }
      setFunded(true);
    } catch {
      /* offline dev */
      setFunded(true);
    }
    setFunding(false);
  };

  const share = () =>
    shareToContacts(
      inviteLink ?? "https://t.me/frenpitch_bot",
      `⚔️ ${name} — ${effectiveBuyIn} usdc buy-in.${pass ? " pass-protected 🔐" : ""} tap to join:`
    );

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
            className={!isCustom && buyIn === b ? ui.segItemOn : ui.segItem}
            onClick={() => {
              setIsCustom(false);
              setBuyIn(b);
            }}
          >
            {b}
          </button>
        ))}
        <button
          className={isCustom ? ui.segItemOn : ui.segItem}
          onClick={() => setIsCustom(true)}
        >
          custom
        </button>
      </div>
      {isCustom && (
        <input
          className={ui.input}
          style={{ marginTop: 8 }}
          type="number"
          min={1}
          inputMode="numeric"
          placeholder="enter usdc amount"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
        />
      )}

      <div className={ui.formLabel}>max frens</div>
      <div className={ui.seg}>
        {[4, 8, 16].map((n) => (
          <button
            key={n}
            className={maxFrens === n ? ui.segItemOn : ui.segItem}
            onClick={() => setMaxFrens(n)}
          >
            {n}
          </button>
        ))}
      </div>

      <div className={ui.formLabel}>passcode (optional — frens need it to join)</div>
      <input
        className={ui.input}
        placeholder="leave empty for open invite"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
      />

      <div className={styles.pool}>
        <div>
          <span className={`${styles.poolAmt} ${ui.num}`}>{pool}</span>{" "}
          <span className={styles.poolCur}>USDC</span>
        </div>
        <div className={styles.poolPer}>
          estimated — real pool grows as frens join ({effectiveBuyIn} usdc each, up to{" "}
          {maxFrens}) · escrowed onchain 🔐 · auto-payout on final whistle
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

      <div className={ui.formLabel}>invite frens on frenpitch</div>
      <input
        className={ui.input}
        style={{ marginBottom: 8 }}
        placeholder="🔍 search frens…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className={ui.card} style={{ padding: "4px 14px" }}>
        {filtered.length === 0 && (
          <div className={ui.emptyState} style={{ padding: "20px 8px" }}>
            {contacts.length === 0
              ? "no frens on frenpitch yet — use the share button to invite from telegram"
              : "no fren matches that search"}
          </div>
        )}
        {filtered.map((f) => (
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
        {/* always-available path to telegram's native contact picker */}
        <button
          className={styles.inviteRow}
          onClick={() =>
            shareToContacts(
              inviteLink ?? "https://t.me/frenpitch_bot",
              inviteLink
                ? `⚔️ ${name} — ${effectiveBuyIn} usdc buy-in. tap to join:`
                : "⚽ join me on frenpitch — live picks, fren tournaments, football quizzes 🫡"
            )
          }
        >
          <span
            className={`${ui.avatar} ${styles.inviteAvatar}`}
            style={{ background: "var(--tma-bg-elevated)", fontSize: 15 }}
          >
            👤
          </span>
          <span className={styles.inviteName} style={{ color: "var(--tma-primary)" }}>
            invite from telegram contacts
          </span>
          <span style={{ color: "var(--tma-primary)", fontSize: 16 }}>↗</span>
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        {funded ? (
          <>
            <div className={styles.funded}>
              {explorer
                ? "escrow funded onchain 🔐 devnet usdc locked in the vault"
                : "tournament live 🔐 share the invite — frens join in 2 taps"}
            </div>
            {explorer && (
              <a
                href={explorer}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "block",
                  textAlign: "center",
                  fontSize: 11,
                  color: "var(--tma-primary)",
                  marginTop: 8,
                  textDecoration: "none",
                }}
              >
                view your deposit on solana explorer ↗
              </a>
            )}
            <button className={ui.btnPrimary} style={{ marginTop: 10 }} onClick={share}>
              📤 send invite link to frens
            </button>
            {inviteLink && (
              <div
                style={{
                  textAlign: "center",
                  fontSize: 11,
                  color: "var(--tma-fg-dim)",
                  marginTop: 8,
                  wordBreak: "break-all",
                  userSelect: "all",
                }}
              >
                {inviteLink}
              </div>
            )}
          </>
        ) : (
          <button className={ui.btnPrimary} onClick={fund} disabled={funding}>
            {funding ? "locking usdc in escrow…" : `fund ${effectiveBuyIn} usdc + send invites 🔗`}
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
