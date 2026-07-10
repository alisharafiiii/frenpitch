import { NextResponse } from "next/server";
import { identityFromRequest } from "@/app/lib/server/auth";
import { getOrCreateUser, getTournament } from "@/app/lib/server/db";
import {
  explorerUrl,
  fundTournament,
  isEscrowConfigured,
} from "@/app/lib/server/solana";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // devnet confirms can be slow

/** POST /api/tournaments/fund — real devnet escrow deposit.
 *  body: { code }. wallet is custodial + invisible; mock usdc is
 *  auto-minted (devnet faucet ux). returns the explorer link. */
export async function POST(req: Request) {
  const who = identityFromRequest(req);
  await getOrCreateUser(who.id, who.username, who.name, who.photoUrl);

  const { code } = (await req.json()) as { code?: string };
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const t = await getTournament(code);
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!isEscrowConfigured()) {
    return NextResponse.json(
      { error: "escrow not configured — run solana-setup + add env vars" },
      { status: 503 }
    );
  }

  try {
    const { txSig, vault } = await fundTournament(code, who.id, t.buyInUsdc);
    return NextResponse.json({ txSig, vault, explorer: explorerUrl(txSig) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "funding failed";
    console.error("fund failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
