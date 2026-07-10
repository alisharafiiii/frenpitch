import { NextResponse } from "next/server";
import { identityFromRequest } from "@/app/lib/server/auth";
import { getOrCreateUser, redis } from "@/app/lib/server/db";

export const dynamic = "force-dynamic";

/** quiz lobbies — synced multiplayer via polling.
 *  keys:
 *    quiz:{code}          hash → { code, hostId, status, startedAt, seed }
 *    quiz:{code}:players  hash → userId → JSON { handle, initial, score }
 */

interface QuizLobby {
  code: string;
  hostId: string;
  status: "lobby" | "running" | "done";
  startedAt: number; // epoch ms when question 1 begins
  seed: number; // question order seed — same for every player
}

function quizCode(): string {
  return `q${Math.random().toString(36).slice(2, 7)}`;
}

/** POST — create a lobby */
export async function POST(req: Request) {
  const who = identityFromRequest(req);
  const user = await getOrCreateUser(who.id, who.username, who.name, who.photoUrl);

  const lobby: QuizLobby = {
    code: quizCode(),
    hostId: who.id,
    status: "lobby",
    startedAt: 0,
    seed: Math.floor(Math.random() * 1_000_000),
  };
  await redis().hset(`quiz:${lobby.code}`, lobby as unknown as Record<string, unknown>);
  await redis().hset(`quiz:${lobby.code}:players`, {
    [who.id]: JSON.stringify({
      handle: user.username,
      initial: (user.name[0] ?? "?").toUpperCase(),
      score: 0,
    }),
  });
  await redis().expire(`quiz:${lobby.code}`, 3600);
  await redis().expire(`quiz:${lobby.code}:players`, 3600);

  return NextResponse.json({
    lobby,
    inviteLink: `https://t.me/frenpitch_bot?startapp=${lobby.code}`,
  });
}

/** PUT — join a lobby (body: { code }) */
export async function PUT(req: Request) {
  const who = identityFromRequest(req);
  const user = await getOrCreateUser(who.id, who.username, who.name, who.photoUrl);
  const { code } = (await req.json()) as { code?: string };
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const lobby = await redis().hgetall<Record<string, string | number>>(`quiz:${code}`);
  if (!lobby || !lobby.code) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (lobby.status !== "lobby") return NextResponse.json({ error: "already started" }, { status: 400 });

  await redis().hset(`quiz:${code}:players`, {
    [who.id]: JSON.stringify({
      handle: user.username,
      initial: (user.name[0] ?? "?").toUpperCase(),
      score: 0,
    }),
  });
  return NextResponse.json({ joined: true });
}

/** GET ?code= — lobby state + players (polled) */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const lobby = await redis().hgetall<Record<string, string | number>>(`quiz:${code}`);
  if (!lobby || !lobby.code) return NextResponse.json({ error: "not found" }, { status: 404 });

  const raw = (await redis().hgetall<Record<string, string>>(`quiz:${code}:players`)) ?? {};
  const players = Object.entries(raw).map(([id, v]) => {
    const p = typeof v === "string" ? JSON.parse(v) : v;
    return { id, handle: p.handle, initial: p.initial, score: Number(p.score) };
  });

  return NextResponse.json({
    lobby: {
      code: lobby.code,
      hostId: String(lobby.hostId),
      status: lobby.status,
      startedAt: Number(lobby.startedAt),
      seed: Number(lobby.seed),
    },
    players,
  });
}

/** PATCH — host starts the match, or a player reports a score
 *  body: { code, action: "start" } | { code, action: "score", points } */
export async function PATCH(req: Request) {
  const who = identityFromRequest(req);
  const body = (await req.json()) as { code?: string; action?: string; points?: number };
  if (!body.code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const key = `quiz:${body.code}`;
  const lobby = await redis().hgetall<Record<string, string | number>>(key);
  if (!lobby || !lobby.code) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.action === "start") {
    if (String(lobby.hostId) !== who.id) {
      return NextResponse.json({ error: "only the host starts" }, { status: 403 });
    }
    await redis().hset(key, { status: "running", startedAt: Date.now() + 4000 });
    return NextResponse.json({ started: true });
  }

  if (body.action === "score") {
    const raw = await redis().hget<string>(`quiz:${body.code}:players`, who.id);
    if (raw) {
      const p = typeof raw === "string" ? JSON.parse(raw) : raw;
      p.score = Number(p.score) + Number(body.points ?? 0);
      await redis().hset(`quiz:${body.code}:players`, { [who.id]: JSON.stringify(p) });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
