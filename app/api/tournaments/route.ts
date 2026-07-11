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
  // "t" prefix — quiz lobby codes use "q", the app routes by prefix
  return `t${Math.random().toString(36).slice(2, 8)}`;
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
    ...(body.pass ? { pass: String(body.pass).trim() } : {}),
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
  const inviteLink = `https://t.me/${BOT}/app?startapp=${t.code}`;
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
  const { pass: _pass, ...safe } = t; // never leak the pass

  // live onchain pool (devnet vault balance) — null if escrow not set up
  let onchainPool: number | null = null;
  try {
    const { vaultBalance } = await import("@/app/lib/server/solana");
    onchainPool = await vaultBalance(code);
  } catch {
    /* escrow optional */
  }

  return NextResponse.json({
    tournament: { ...safe, hasPass: Boolean(t.pass), onchainPool },
    members: members
      .map((m) => ({
        id: m.id,
        username: m.username,
        name: m.name,
        initial: (m.name[0] ?? "?").toUpperCase(),
        photoUrl: `/api/avatar/${m.id}`,
        pnl: m.pnl,
        streak: m.streak,
        online: Date.now() - m.lastSeen < 10 * 60 * 1000,
        isCreator: m.id === t.creatorId,
      }))
      .sort((a, b) => b.pnl - a.pnl),
  });
}

/** PUT /api/tournaments — join. body: { code, pass? } */
export async function PUT(req: Request) {
  const who = identityFromRequest(req);
  await getOrCreateUser(who.id, who.username, who.name, who.photoUrl);
  const { code, pass } = (await req.json()) as { code?: string; pass?: string };
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  const result = await joinTournament(code, who.id, pass);
  if (result === "pass_required") {
    return NextResponse.json({ error: "pass_required" }, { status: 403 });
  }
  if (result === "closed") {
    return NextResponse.json({ error: "closed or full" }, { status: 400 });
  }
  const members = await getTournamentMembers(code);
  return NextResponse.json({ joined: true, members: members.length });
}
