"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { quizBank } from "@/app/data/mock-quiz";
import { mockFrens } from "@/app/data/mock-frens";
import { getTgUser, shareToContacts } from "@/app/lib/telegram";
import { api } from "@/app/lib/api";
import type { QuizQuestion } from "@/app/types";
import ui from "@/app/styles/ui.module.css";
import styles from "./quiz.module.css";

/* ---------- shared bits ---------- */

interface Player {
  id: string;
  handle: string;
  initial: string;
  score: number;
  isMe: boolean;
}

const REVEAL_MS = 2500;

/** deterministic shuffle so every player in a lobby gets the same order */
function shuffledBank(seed: number): QuizQuestion[] {
  const arr = [...quizBank];
  let s = seed || 1;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 48271) % 2147483647;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const GRADS: [string, string][] = [
  ["#6c5ce7", "#a29bfe"],
  ["#00b894", "#55efc4"],
  ["#e17055", "#fab1a0"],
  ["#0984e3", "#74b9ff"],
  ["#fdcb6e", "#ffeaa7"],
  ["#fd79a8", "#e84393"],
];

function gradFor(i: number): [string, string] {
  return GRADS[i % GRADS.length];
}

/* ---------- page: mode router ---------- */

type Mode =
  | { kind: "start" }
  | { kind: "bots" }
  | { kind: "lobby"; code: string; isHost: boolean; inviteLink?: string }
  | { kind: "match"; code: string; startedAt: number; seed: number };

export default function QuizPage() {
  const [mode, setMode] = useState<Mode>({ kind: "start" });

  // opened via invite link → join the lobby immediately
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      api("/api/quiz", { method: "PUT", body: { code } })
        .then(() => setMode({ kind: "lobby", code, isHost: false }))
        .catch(() => {
          /* dead lobby — stay on start screen */
        });
    }
  }, []);

  if (mode.kind === "start") return <StartScreen onMode={setMode} />;
  if (mode.kind === "bots") return <BotMatch onExit={() => setMode({ kind: "start" })} />;
  if (mode.kind === "lobby")
    return (
      <Lobby
        code={mode.code}
        isHost={mode.isHost}
        inviteLink={mode.inviteLink}
        onStart={(startedAt, seed) => setMode({ kind: "match", code: mode.code, startedAt, seed })}
        onExit={() => setMode({ kind: "start" })}
      />
    );
  return (
    <LobbyMatch
      code={mode.code}
      startedAt={mode.startedAt}
      seed={mode.seed}
      onExit={() => setMode({ kind: "start" })}
    />
  );
}

/* ---------- start screen (no auto-start!) ---------- */

function StartScreen({ onMode }: { onMode: (m: Mode) => void }) {
  const [creating, setCreating] = useState(false);

  const createLobby = async () => {
    setCreating(true);
    try {
      const res = await api<{ lobby: { code: string }; inviteLink: string }>("/api/quiz", {
        method: "POST",
      });
      onMode({ kind: "lobby", code: res.lobby.code, isHost: true, inviteLink: res.inviteLink });
    } catch {
      setCreating(false);
    }
  };

  return (
    <>
      <div className={ui.sectionLabel}>🧠 football quiz</div>
      <div className={ui.card} style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>challenge your frens ⚔️</div>
        <div style={{ fontSize: 12, color: "var(--tma-fg-dim)", marginBottom: 12 }}>
          same questions, same clock, served by the platform — nobody picks, nobody
          cheats. fastest correct answer scores more.
        </div>
        <button className={ui.btnPrimary} onClick={createLobby} disabled={creating}>
          {creating ? "creating lobby…" : "⚔️ create fren lobby"}
        </button>
      </div>
      <div className={ui.card}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>warm up vs bots 🤖</div>
        <div style={{ fontSize: 12, color: "var(--tma-fg-dim)", marginBottom: 12 }}>
          instant solo match against the lobby bots. no stakes, pure practice.
        </div>
        <button className={ui.btnGhost} onClick={() => onMode({ kind: "bots" })}>
          🤖 quick match
        </button>
      </div>
    </>
  );
}

/* ---------- fren lobby (waiting room) ---------- */

function Lobby({
  code,
  isHost,
  inviteLink,
  onStart,
  onExit,
}: {
  code: string;
  isHost: boolean;
  inviteLink?: string;
  onStart: (startedAt: number, seed: number) => void;
  onExit: () => void;
}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const me = getTgUser();

  // poll lobby state every 2s
  useEffect(() => {
    const poll = () =>
      api<{
        lobby: { status: string; startedAt: number; seed: number };
        players: { id: string; handle: string; initial: string; score: number }[];
      }>(`/api/quiz?code=${code}`)
        .then(({ lobby, players: ps }) => {
          setPlayers(
            ps.map((p) => ({ ...p, isMe: p.handle === me.username || p.id === String(me.id) }))
          );
          if (lobby.status === "running") onStart(lobby.startedAt, lobby.seed);
        })
        .catch(() => {});
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const share = () =>
    shareToContacts(
      inviteLink ?? `https://t.me/frenpitch_bot/app?startapp=${code}`,
      "🧠 quiz battle — think you know football? tap to join my lobby:"
    );

  const start = () => api("/api/quiz", { method: "PATCH", body: { code, action: "start" } });

  return (
    <>
      <div className={ui.sectionLabel}>⚔️ lobby · waiting for frens</div>
      <div className={ui.card} style={{ marginBottom: 10 }}>
        {players.map((p, i) => (
          <div key={p.id} className={styles.finalRow}>
            <span
              className={`${ui.avatar} ${styles.finalAvatar}`}
              style={{ background: `linear-gradient(135deg, ${gradFor(i)[0]}, ${gradFor(i)[1]})` }}
            >
              {p.initial}
            </span>
            <span className={styles.finalName}>
              {p.handle} {p.isMe && "(you)"}
            </span>
            <span style={{ fontSize: 11, color: "var(--tma-success)", fontWeight: 700 }}>ready</span>
          </div>
        ))}
        {players.length < 2 && (
          <div className={ui.emptyState} style={{ padding: "14px 8px" }}>
            waiting for frens to join…
          </div>
        )}
      </div>
      <button className={ui.btnPrimary} onClick={share} style={{ marginBottom: 8 }}>
        📤 invite frens to the lobby
      </button>
      {isHost ? (
        <button className={ui.btnPrimary} onClick={start} disabled={players.length < 2}>
          {players.length < 2 ? "need at least 2 players" : `🏁 start match (${players.length} in)`}
        </button>
      ) : (
        <div className={ui.fairNote}>the host starts the match — get ready 🫡</div>
      )}
      <button className={ui.btnGhost} onClick={onExit} style={{ marginTop: 8 }}>
        leave lobby
      </button>
    </>
  );
}

/* ---------- synced fren match ---------- */

function LobbyMatch({
  code,
  startedAt,
  seed,
  onExit,
}: {
  code: string;
  startedAt: number;
  seed: number;
  onExit: () => void;
}) {
  const bank = useRef(shuffledBank(seed)).current;
  const [now, setNow] = useState(Date.now());
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [players, setPlayers] = useState<Player[]>([]);
  const me = getTgUser();

  // clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // poll scores
  useEffect(() => {
    const poll = () =>
      api<{ players: { id: string; handle: string; initial: string; score: number }[] }>(
        `/api/quiz?code=${code}`
      )
        .then(({ players: ps }) =>
          setPlayers(
            ps.map((p) => ({ ...p, isMe: p.handle === me.username || p.id === String(me.id) }))
          )
        )
        .catch(() => {});
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // timeline: [q0 answer][reveal][q1 answer][reveal]...
  const elapsed = now - startedAt;
  const ranked = [...players].sort((a, b) => b.score - a.score);

  if (elapsed < 0) {
    return (
      <div className={ui.emptyState} style={{ paddingTop: 80 }}>
        <div style={{ fontSize: 40, fontWeight: 800 }}>{Math.ceil(-elapsed / 1000)}</div>
        get ready…
      </div>
    );
  }

  let acc = 0;
  let qIndex = -1;
  let phase: "question" | "reveal" = "question";
  let phaseRemaining = 0;
  for (let i = 0; i < bank.length; i++) {
    const qMs = bank[i].seconds * 1000;
    if (elapsed < acc + qMs) {
      qIndex = i;
      phase = "question";
      phaseRemaining = acc + qMs - elapsed;
      break;
    }
    if (elapsed < acc + qMs + REVEAL_MS) {
      qIndex = i;
      phase = "reveal";
      phaseRemaining = acc + qMs + REVEAL_MS - elapsed;
      break;
    }
    acc += qMs + REVEAL_MS;
  }

  if (qIndex === -1) {
    // finished
    return (
      <>
        <div className={ui.sectionLabel}>🏁 final — fren quiz</div>
        <div className={ui.card}>
          {ranked.map((p, i) => (
            <div key={p.id} className={styles.finalRow} style={{ animationDelay: `${i * 0.08}s` }}>
              <span className={`${styles.rank} ${ui.num}`}>{i + 1}</span>
              <span
                className={`${ui.avatar} ${styles.finalAvatar}`}
                style={{ background: `linear-gradient(135deg, ${gradFor(i)[0]}, ${gradFor(i)[1]})` }}
              >
                {p.initial}
              </span>
              <span className={styles.finalName}>
                {p.handle} {p.isMe && "(you)"} {i === 0 && "👑"}
              </span>
              <b className={`${ui.num} ${styles.finalScore}`}>{p.score}</b>
            </div>
          ))}
        </div>
        <button className={ui.btnPrimary} style={{ marginTop: 16 }} onClick={onExit}>
          run it back 🔁
        </button>
      </>
    );
  }

  const q = bank[qIndex];
  const myPick = picked[qIndex];
  const secondsLeft = Math.ceil(phaseRemaining / 1000);

  const answer = (i: number) => {
    if (phase !== "question" || myPick !== undefined) return;
    setPicked((prev) => ({ ...prev, [qIndex]: i }));
    if (i === q.correctIndex) {
      const speedBonus = Math.max(1, Math.round(phaseRemaining / 3000));
      void api("/api/quiz", {
        method: "PATCH",
        body: { code, action: "score", points: 1 + speedBonus },
      });
    }
  };

  return (
    <>
      <div className={styles.playersRow}>
        {ranked.slice(0, 5).map((p, i) => (
          <div key={p.id} className={`${styles.player} ${p.isMe ? styles.playerMe : ""}`}>
            <span
              className={`${ui.avatar} ${styles.playerAvatar}`}
              style={{ background: `linear-gradient(135deg, ${gradFor(i)[0]}, ${gradFor(i)[1]})` }}
            >
              {p.initial}
            </span>
            <span className={styles.playerName}>
              {p.handle}
              {i === 0 && p.score > 0 ? " 👑" : ""}
            </span>
            <span className={`${styles.playerScore} ${ui.num} ${p.isMe ? ui.pos : ""}`}>
              {p.score}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.timerBar}>
        <div
          className={styles.timerFill}
          style={{
            width:
              phase === "question" ? `${(phaseRemaining / (q.seconds * 1000)) * 100}%` : "100%",
          }}
        />
      </div>
      <div className={styles.qCount}>
        question {qIndex + 1} / {bank.length} · ⏱{" "}
        {phase === "question" ? `${secondsLeft}s` : "reveal"}
      </div>

      <div className={styles.qText}>{q.text}</div>

      {q.answers.map((a, i) => {
        const isCorrect = phase === "reveal" && i === q.correctIndex;
        const isWrongPick = phase === "reveal" && myPick === i && i !== q.correctIndex;
        const isMyPick = myPick === i && phase === "question";
        return (
          <button
            key={i}
            className={`${styles.answer} ${isCorrect ? styles.correct : ""} ${isWrongPick ? styles.wrong : ""}`}
            style={isMyPick ? { borderColor: "var(--tma-primary)" } : undefined}
            onClick={() => answer(i)}
          >
            <span>{a}</span>
            <span className={styles.key}>{"ABCD"[i]}</span>
          </button>
        );
      })}

      <div className={ui.fairNote}>🔐 same questions, same clock, for every fren in the lobby</div>
    </>
  );
}

/* ---------- bots match (the old flow, now opt-in practice) ---------- */

function BotMatch({ onExit }: { onExit: () => void }) {
  const me = getTgUser();
  const [players, setPlayers] = useState<Player[]>(() => [
    {
      id: "me",
      handle: me.username,
      initial: (me.name[0] ?? "N").toUpperCase(),
      score: 0,
      isMe: true,
    },
    ...mockFrens.slice(0, 4).map((f) => ({
      id: f.id,
      handle: f.handle.split(".")[0],
      initial: f.initial,
      score: 0,
      isMe: false,
    })),
  ]);
  const [qIndex, setQIndex] = useState(0);
  const [phase, setPhase] = useState<"question" | "reveal" | "final">("question");
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(quizBank[0].seconds);
  const botTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const q = quizBank[qIndex];

  const clearBots = () => {
    botTimers.current.forEach(clearTimeout);
    botTimers.current = [];
  };

  const reveal = useCallback(() => {
    clearBots();
    setPhase("reveal");
    setTimeout(() => {
      if (qIndex + 1 >= quizBank.length) {
        setPhase("final");
      } else {
        setQIndex((i) => i + 1);
        setPickedIdx(null);
        setTimeLeft(quizBank[qIndex + 1].seconds);
        setPhase("question");
      }
    }, 1800);
  }, [qIndex]);

  useEffect(() => {
    if (phase !== "question") return;
    if (timeLeft <= 0) {
      reveal();
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft, reveal]);

  useEffect(() => {
    if (phase !== "question") return;
    players
      .filter((p) => !p.isMe)
      .forEach((p) => {
        const delay = 1500 + Math.random() * (q.seconds - 3) * 1000;
        botTimers.current.push(
          setTimeout(() => {
            if (Math.random() < 0.55) {
              const bonus = Math.max(1, Math.round((q.seconds * 1000 - delay) / 2000));
              setPlayers((prev) =>
                prev.map((pl) => (pl.id === p.id ? { ...pl, score: pl.score + 1 + bonus } : pl))
              );
            }
          }, delay)
        );
      });
    return clearBots;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIndex, phase]);

  const answer = (i: number) => {
    if (phase !== "question" || pickedIdx !== null) return;
    setPickedIdx(i);
    if (i === q.correctIndex) {
      const bonus = Math.max(1, Math.round(timeLeft / 3));
      setPlayers((prev) => prev.map((p) => (p.isMe ? { ...p, score: p.score + 1 + bonus } : p)));
    }
    reveal();
  };

  const ranked = [...players].sort((a, b) => b.score - a.score);

  if (phase === "final") {
    return (
      <>
        <div className={ui.sectionLabel}>🏁 final — practice match</div>
        <div className={ui.card}>
          {ranked.map((p, i) => (
            <div key={p.id} className={styles.finalRow} style={{ animationDelay: `${i * 0.08}s` }}>
              <span className={`${styles.rank} ${ui.num}`}>{i + 1}</span>
              <span
                className={`${ui.avatar} ${styles.finalAvatar}`}
                style={{ background: `linear-gradient(135deg, ${gradFor(i)[0]}, ${gradFor(i)[1]})` }}
              >
                {p.initial}
              </span>
              <span className={styles.finalName}>
                {p.handle} {p.isMe && "(you)"} {i === 0 && "👑"}
              </span>
              <b className={`${ui.num} ${styles.finalScore}`}>{p.score}</b>
            </div>
          ))}
        </div>
        <button className={ui.btnPrimary} style={{ marginTop: 16 }} onClick={onExit}>
          back to quiz home
        </button>
      </>
    );
  }

  return (
    <>
      <div className={styles.playersRow}>
        {ranked.slice(0, 5).map((p, i) => (
          <div key={p.id} className={`${styles.player} ${p.isMe ? styles.playerMe : ""}`}>
            <span
              className={`${ui.avatar} ${styles.playerAvatar}`}
              style={{ background: `linear-gradient(135deg, ${gradFor(i)[0]}, ${gradFor(i)[1]})` }}
            >
              {p.initial}
            </span>
            <span className={styles.playerName}>
              {p.handle}
              {i === 0 && p.score > 0 ? " 👑" : ""}
            </span>
            <span className={`${styles.playerScore} ${ui.num} ${p.isMe ? ui.pos : ""}`}>
              {p.score}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.timerBar}>
        <div className={styles.timerFill} style={{ width: `${(timeLeft / q.seconds) * 100}%` }} />
      </div>
      <div className={styles.qCount}>
        question {qIndex + 1} / {quizBank.length} · ⏱ {timeLeft}s · 🤖 practice
      </div>

      <div className={styles.qText}>{q.text}</div>

      {q.answers.map((a, i) => {
        const isCorrect = phase === "reveal" && i === q.correctIndex;
        const isWrongPick = phase === "reveal" && pickedIdx === i && i !== q.correctIndex;
        return (
          <button
            key={i}
            className={`${styles.answer} ${isCorrect ? styles.correct : ""} ${isWrongPick ? styles.wrong : ""}`}
            style={{ animationDelay: `${i * 0.07}s` }}
            onClick={() => answer(i)}
          >
            <span>{a}</span>
            <span className={styles.key}>{"ABCD"[i]}</span>
          </button>
        );
      })}

      <div className={ui.fairNote}>
        🔐 questions served by the platform — nobody picks, nobody cheats
      </div>
    </>
  );
}
