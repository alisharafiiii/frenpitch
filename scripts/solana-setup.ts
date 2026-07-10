/**
 * one-time devnet setup — run once:
 *
 *   npm run solana-setup
 *
 * creates:
 *   1. the escrow authority wallet (pays all fees, owns tournament vaults)
 *   2. the mock USDC mint (6 decimals, authority = escrow wallet)
 * saves both to .env.local. add the same two vars to vercel afterwards.
 */

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createMint } from "@solana/spl-token";
import fs from "node:fs";
import path from "node:path";

const RPC = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";
const ENV_PATH = path.join(process.cwd(), ".env.local");

function upsertEnv(name: string, value: string) {
  let env = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  env = env
    .split("\n")
    .filter((l) => !l.startsWith(`${name}=`))
    .join("\n")
    .trimEnd();
  fs.writeFileSync(ENV_PATH, env + `\n${name}=${value}\n`);
}

async function main() {
  const connection = new Connection(RPC, "confirmed");

  // 1. escrow authority
  let escrow: Keypair;
  const existing = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, "utf8").match(/^SOLANA_ESCROW_SECRET=(.+)$/m)
    : null;
  if (existing) {
    escrow = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(existing[1])));
    console.log("♻️  reusing escrow authority:", escrow.publicKey.toBase58());
  } else {
    escrow = Keypair.generate();
    upsertEnv("SOLANA_ESCROW_SECRET", JSON.stringify(Array.from(escrow.secretKey)));
    console.log("🔑 escrow authority created:", escrow.publicKey.toBase58());
  }

  // 2. devnet SOL for fees
  let balance = await connection.getBalance(escrow.publicKey);
  console.log("balance:", (balance / LAMPORTS_PER_SOL).toFixed(3), "SOL");
  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.log("⛽ requesting devnet airdrop (free)...");
    try {
      const sig = await connection.requestAirdrop(escrow.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      balance = await connection.getBalance(escrow.publicKey);
      console.log("✅ airdropped. balance:", (balance / LAMPORTS_PER_SOL).toFixed(3), "SOL");
    } catch {
      console.log("⚠️  airdrop rate-limited. get free devnet SOL at https://faucet.solana.com");
      console.log("   send it to:", escrow.publicKey.toBase58(), "then re-run this script.");
      if (balance === 0) process.exit(1);
    }
  }

  // 3. mock USDC mint
  const hasMint = fs.readFileSync(ENV_PATH, "utf8").match(/^SOLANA_USDC_MINT=(.+)$/m);
  if (hasMint) {
    console.log("♻️  mock usdc mint exists:", hasMint[1]);
  } else {
    console.log("🪙 creating mock USDC mint...");
    const mint = await createMint(connection, escrow, escrow.publicKey, null, 6);
    upsertEnv("SOLANA_USDC_MINT", mint.toBase58());
    console.log("✅ mock USDC mint:", mint.toBase58());
  }

  console.log("");
  console.log("🎉 devnet setup done. two more things:");
  console.log("   1. add SOLANA_ESCROW_SECRET and SOLANA_USDC_MINT to vercel");
  console.log("      (values are in .env.local)");
  console.log("   2. redeploy");
}

main().catch((e) => {
  console.error("❌ setup failed:", e?.message ?? e);
  process.exit(1);
});
