import { NextResponse } from "next/server";
import { identityFromRequest } from "@/app/lib/server/auth";
import { getTournament, getTournamentMembers, redis } from "@/app/lib/server/db";
import {
  explorerUrl,
  isEscrowConfigured,
  payoutTournament,
  vaultBalance,
} from "@/app/lib/server/solana";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SPLITS: Record<string, number[]> = {
  winner_take_all: [1],
  split_70_20_10: [0.7, 0.2, 0.1],
  even_top3: [0.34, 0.33, 0.33],
};

/** POST /api/tournaments/settle — creator closes the tournament:
 *  members ranked by pnl, vault pays out by the split, onchain.
 *  body: { code } */
export async function POST(req: Request) {
  const who = identityFromRequest(req);
  const { code } = (await req.json()) as { code?: string };
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const t = await getTournament(code);
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (t.creatorId !== who.id) {
    return NextResponse.json({ error: "only the creator settles" }, { status: 403 });
  }
  if (t.status !== "open") {
    return NextResponse.json({ error: "already settled" }, { status: 400 });
  }
  if (!isEscrowConfigured()) {
    return NextResponse.json({ error: "escrow not configured" }, { status: 503 });
  }

  const members = await getTournamentMembers(code);
  if (members.length < 2) {
    return NextResponse.json({ error: "need at least 2 frens" }, { status: 400 });
  }

  // standings: matchday pnl decides
  const ranked = [...members].sort((a, b) => b.pnl - a.pnl);
  const pool = (await vaultBalance(code)) ?? 0;
  if (pool <= 0) {
    return NextResponse.json({ error: "vault is empty" }, { status: 400 });
  }

  const shares = SPLITS[t.split] ?? SPLITS.split_70_20_10;
  const winners = shares
    .slice(0, ranked.length)
    .map((share, i) => ({
      userId: ranked[i].id,
      username: ranked[i].username,
      amountUsdc: Math.floor(pool * share * 100) / 100,
    }));

  try {
    const txSig = await payoutTournament(code, winners);
    await redis().hset(`tour:${code}`, { status: "settled" });
    return NextResponse.json({
      settled: true,
      winners,
      txSig,
      explorer: explorerUrl(txSig),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "payout failed";
    console.error("tournament settle failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
