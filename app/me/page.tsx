"use client";

import { useMemo } from "react";
import { getTgUser } from "@/app/lib/telegram";
import ui from "@/app/styles/ui.module.css";

/** profile — auto-created from telegram login (pfp, name, id),
 *  editable later. droid pairing lives here too. */
export default function MePage() {
  const user = useMemo(() => getTgUser(), []);

  return (
    <>
      <div className={ui.card} style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          className={ui.avatar}
          style={{
            width: 56,
            height: 56,
            fontSize: 20,
            background: "linear-gradient(135deg, #6c5ce7, #a29bfe)",
          }}
        >
          {user.name[0]?.toUpperCase()}
        </span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{user.username}</div>
          <div style={{ fontSize: 11, color: "var(--tma-fg-dim)" }}>
            auto-created from telegram · tap to edit
          </div>
        </div>
      </div>

      <div className={ui.sectionLabel}>🤖 stackchan droid</div>
      <div className={ui.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
          pair your matchday droid
        </div>
        <div style={{ fontSize: 12, color: "var(--tma-fg-dim)", marginBottom: 12 }}>
          your stackchan reacts to goals, calls odds moves, roasts your frens&apos;
          picks, and hosts halftime quizzes. scan the qr from the droid screen to pair.
        </div>
        <button className={ui.btnGhost}>📷 pair droid (qr)</button>
      </div>

      <div className={ui.sectionLabel}>🔐 wallet</div>
      <div className={ui.card}>
        <div style={{ fontSize: 12, color: "var(--tma-fg-dim)" }}>
          embedded solana wallet — created silently on first login. only tournament
          buy-ins touch the chain; points stay off-chain for speed.
        </div>
      </div>
    </>
  );
}
