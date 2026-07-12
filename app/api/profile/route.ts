import { NextResponse } from "next/server";
import { identityFromRequest } from "@/app/lib/server/auth";
import { getOrCreateUser, redis } from "@/app/lib/server/db";

export const dynamic = "force-dynamic";

/** GET /api/profile — everything the me tab shows */

function titleFor(level: number): string {
  if (level >= 15) return "Legend";
  if (level >= 10) return "Elite Player";
  if (level >= 5) return "Baller";
  return "Rookie";
}

export async function GET(req: Request) {
  const who = identityFromRequest(req);
  const user = await getOrCreateUser(who.id, who.username, who.name, who.photoUrl);

  const u = (await redis().hgetall<Record<string, string | number>>(`user:${who.id}`)) ?? {};
  const quizPoints = Number(u.quizPoints ?? 0);
  const quizCorrect = Number(u.quizCorrect ?? 0);
  const quizAnswered = Number(u.quizAnswered ?? 0);
  const picksWon = Number(u.picksWon ?? 0);
  const winStreak = Number(u.bestWinStreak ?? 0);
  const tournaments = await redis().scard(`user:${who.id}:tours`);

  const points = quizPoints + Math.max(0, Number(u.pnl ?? 0));
  const level = 1 + Math.floor(points / 250);

  const gamesPlayed = Number(u.quizGames ?? 0);
  const quizBestStreak = Number(u.quizBestStreak ?? 0);
  const accuracy = quizAnswered > 0 ? Math.round((quizCorrect / quizAnswered) * 100) : null;

  return NextResponse.json({
    handle: user.username,
    id: user.id,
    level,
    title: titleFor(level),
    points,
    stats: {
      tournaments,
      wins: picksWon,
      winStreak,
      accuracy,
    },
    achievements: [
      { key: "quiz_wizard", name: "Quiz Wizard", desc: "answered 500 questions", earned: quizAnswered >= 500 },
      { key: "sharp_shooter", name: "Sharp Shooter", desc: "80%+ accuracy in 10 quizzes", earned: gamesPlayed >= 10 && (accuracy ?? 0) >= 80 },
      { key: "hot_streak", name: "Hot Streak", desc: "won 5 in a row", earned: winStreak >= 5 || quizBestStreak >= 5 },
      { key: "tournamenter", name: "Tournamenter", desc: "played 20 tournaments", earned: tournaments >= 20 },
      { key: "frens_united", name: "Frens United", desc: "joined 10 fren lobbies", earned: gamesPlayed >= 10 },
    ],
  });
}
