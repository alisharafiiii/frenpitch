"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { quizBank } from "@/app/data/mock-quiz";
import { mockFrens } from "@/app/data/mock-frens";
import { getTgUser } from "@/app/lib/telegram";
import ui from "@/app/styles/ui.module.css";
import styles from "./quiz.module.css";

interface Player {
  id: string;
  handle: string;
  initial: string;
  gradient: [string, string];
  score: number;
  isMe: boolean;
}

/** lobby quiz — N frens, identical platform-served questions, live scores.
 *  Mock: bot frens answer with random delay/accuracy; production swaps the
 *  bots for websocket lobby state, same UI. */
export default function QuizPage() {
  const me = getTgUser();
  const [players, setPlayers] = useState<Player[]>(() => [
    { id: "me", handle: me.username, initial: me.name[0]?.toUpperCase() ?? "N", gradient: ["#6c5ce7", "#a29bfe"], score: 0, isMe: true },
    ...mockFrens.slice(0, 5).map((f) => ({
      id: f.id,
      handle: f.handle.split(".")[0],
      initial: f.initial,
      gradient: f.gradient,
      score: 0,
      isMe: false,
    })),
  ]);
  const [qIndex, setQIndex] = useState(0);
  const [phase, setPhase] = useState<"question" | "reveal" | "final">("question");
  const [picked, setPicked] = useState<number | null>(null);
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
        setPicked(null);
        setTimeLeft(quizBank[qIndex + 1].seconds);
        setPhase("question");
      }
    }, 1800);
  }, [qIndex]);

  // countdown
  useEffect(() => {
    if (phase !== "question") return;
    if (timeLeft <= 0) {
      reveal();
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft, reveal]);

  // bot frens answer with random delay + 55% accuracy
  useEffect(() => {
    if (phase !== "question") return;
    players
      .filter((p) => !p.isMe)
      .forEach((p) => {
        const delay = 1500 + Math.random() * (q.seconds - 3) * 1000;
        botTimers.current.push(
          setTimeout(() => {
            if (Math.random() < 0.55) {
              const speedBonus = Math.max(1, Math.round((q.seconds * 1000 - delay) / 2000));
              setPlayers((prev) =>
                prev.map((pl) => (pl.id === p.id ? { ...pl, score: pl.score + 1 + speedBonus } : pl))
              );
            }
          }, delay)
        );
      });
    return clearBots;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIndex, phase]);

  const answer = (i: number) => {
    if (phase !== "question" || picked !== null) return;
    setPicked(i);
    if (i === q.correctIndex) {
      const speedBonus = Math.max(1, Math.round(timeLeft / 3));
      setPlayers((prev) =>
        prev.map((p) => (p.isMe ? { ...p, score: p.score + 1 + speedBonus } : p))
      );
    }
    reveal();
  };

  const ranked = [...players].sort((a, b) => b.score - a.score);
  const leader = ranked[0];

  if (phase === "final") {
    return (
      <>
        <div className={ui.sectionLabel}>🏁 final — lobby quiz</div>
        <div className={ui.card}>
          {ranked.map((p, i) => (
            <div key={p.id} className={styles.finalRow} style={{ animationDelay: `${i * 0.08}s` }}>
              <span className={`${styles.rank} ${ui.num}`}>{i + 1}</span>
              <span
                className={`${ui.avatar} ${styles.finalAvatar}`}
                style={{ background: `linear-gradient(135deg, ${p.gradient[0]}, ${p.gradient[1]})` }}
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
        <button
          className={ui.btnPrimary}
          style={{ marginTop: 16 }}
          onClick={() => window.location.reload()}
        >
          run it back 🔁
        </button>
      </>
    );
  }

  return (
    <>
      <div className={styles.playersRow}>
        {ranked.slice(0, 5).map((p) => (
          <div key={p.id} className={`${styles.player} ${p.isMe ? styles.playerMe : ""}`}>
            <span
              className={`${ui.avatar} ${styles.playerAvatar}`}
              style={{ background: `linear-gradient(135deg, ${p.gradient[0]}, ${p.gradient[1]})` }}
            >
              {p.initial}
            </span>
            <span className={styles.playerName}>
              {p.handle}
              {p.id === leader.id && p.score > 0 ? " 👑" : ""}
            </span>
            <span className={`${styles.playerScore} ${ui.num} ${p.isMe ? ui.pos : ""}`}>
              {p.score}
            </span>
          </div>
        ))}
        {ranked.length > 5 && (
          <div className={styles.player}>
            <span className={`${ui.avatar} ${styles.playerAvatar} ${styles.more}`}>
              +{ranked.length - 5}
            </span>
            <span className={styles.playerName}>more</span>
            <span className={styles.playerScore}>·</span>
          </div>
        )}
      </div>

      <div className={styles.timerBar}>
        <div
          className={styles.timerFill}
          style={{ width: `${(timeLeft / q.seconds) * 100}%` }}
        />
      </div>
      <div className={styles.qCount}>
        question {qIndex + 1} / {quizBank.length} · ⏱ {timeLeft}s
      </div>

      <div className={styles.qText}>{q.text}</div>

      {q.answers.map((a, i) => {
        const isCorrect = phase === "reveal" && i === q.correctIndex;
        const isWrongPick = phase === "reveal" && picked === i && i !== q.correctIndex;
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
