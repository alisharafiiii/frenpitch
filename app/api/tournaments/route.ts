import { NextResponse } from "next/server";
import { identityFromRequest } from "@/app/lib/server/auth";
import {
  createTournament,
  getOrCreateUser,
  getTournament,
  getTournamentMembers,
  joinTournament,
  type TournamentRecord,
} from "@/app/lib/server/db";

export const dynamic = "force-dynamic";

const BOT = "frenpitch_bot";

function inviteCode(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** POST /api/tournaments — create. body: { name, buyInUsdc, split, maxFrens } */
export async function POST(req: Request) {
  const who = identityFromRequest(req);
  await getOrCreateUser(who.id, who.username, who.name, who.photoUrl);

  const body = (await req.json()) as Partial<TournamentRecord>;
  if (!body.name || !body.buyInUsdc) {
    return NextResponse.json({ error: "invalid tournament" }, { status: 400 });
  }

  const t: TournamentRecord = {
    code: inviteCode(),
    name: String(body.name),
    buyInUsdc: Number(body.buyInUsdc),
    split: String(body.split ?? "split_70_20_10"),
    creatorId: who.id,
    maxFrens: Number(body.maxFrens ?? 8),
    status: "open",
    createdAt: Date.now(),
  };
  await createTournament(t);

  // tg deep link — opens the mini app with the code as start param
  const inviteLink = `https://t.me/${BOT}?startapp=${t.code}`;
  return NextResponse.json({ tournament: t, inviteLink });
}

/** GET /api/tournaments?code=xyz — tournament + members (pass-protected:
 *  knowing the code IS the pass, like minted mind) */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  const t = await getTournament(code);
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  const members = await getTournamentMembers(code);
  return NextResponse.json({
    tournament: t,
    members: members.map((m) => ({ id: m.id, username: m.username, name: m.name })),
  });
}

/** PUT /api/tournaments — join. body: { code } */
export async function PUT(req: Request) {
  const who = identityFromRequest(req);
  await getOrCreateUser(who.id, who.username, who.name, who.photoUrl);
  const { code } = (await req.json()) as { code?: string };
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  const ok = await joinTournament(code, who.id);
  if (!ok) return NextResponse.json({ error: "closed or full" }, { status: 400 });
  const members = await getTournamentMembers(code);
  return NextResponse.json({ joined: true, members: members.length });
}
