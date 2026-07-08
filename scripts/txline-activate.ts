/**
 * one-shot txline api key setup — free world cup tier (real-time, level 12)
 *
 *   npm run get-key
 *
 * what it does:
 *   1. creates (or reuses) a burner wallet at .keys/txline-burner.json
 *   2. asks you to fund it with a little SOL (one-time, ~$1) if empty
 *   3. registers the free subscription on-chain
 *   4. activates and prints your api token, saved to .env.local
 */

import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import axios from "axios";
import nacl from "tweetnacl";
import fs from "node:fs";
import path from "node:path";

// ---- config (mainnet = the real free world cup feed) ----
const RPC_URL = process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";
const API_ORIGIN = "https://txline.txodds.com";
const PROGRAM_ID = new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");
const TXL_MINT = new PublicKey("Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL");
const SERVICE_LEVEL_ID = Number(process.env.TXLINE_LEVEL ?? 12); // 12 = real-time, free
const DURATION_WEEKS = 4;
const SELECTED_LEAGUES: number[] = [];
const MIN_SOL = 0.005;

const KEY_DIR = path.join(process.cwd(), ".keys");
const KEY_PATH = path.join(KEY_DIR, "txline-burner.json");
const ENV_PATH = path.join(process.cwd(), ".env.local");

function loadOrCreateKeypair(): Keypair {
  if (fs.existsSync(KEY_PATH)) {
    const raw = JSON.parse(fs.readFileSync(KEY_PATH, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  const kp = Keypair.generate();
  fs.mkdirSync(KEY_DIR, { recursive: true });
  fs.writeFileSync(KEY_PATH, JSON.stringify(Array.from(kp.secretKey)));
  console.log("🔑 new burner wallet created at .keys/txline-burner.json");
  return kp;
}

async function main() {
  const keypair = loadOrCreateKeypair();
  console.log("burner wallet:", keypair.publicKey.toBase58());

  const connection = new Connection(RPC_URL, "confirmed");
  const balance = (await connection.getBalance(keypair.publicKey)) / 1e9;
  console.log("balance:", balance.toFixed(4), "SOL");

  if (balance < MIN_SOL) {
    console.log("");
    console.log("⛽ needs a little SOL for one transaction fee (~$1 worth is plenty).");
    console.log("   send some SOL to the address above, then run `npm run get-key` again.");
    process.exit(0);
  }

  // anchor setup — loads the program's IDL from scripts/idl/txoracle.json
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const idl = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "scripts", "idl", "txoracle.json"), "utf8")
  ) as anchor.Idl;
  const program = new anchor.Program(idl, provider);

  // derive the accounts the subscribe call needs
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    PROGRAM_ID
  );
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    TXL_MINT,
    tokenTreasuryPda,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    PROGRAM_ID
  );
  const userTokenAccount = getAssociatedTokenAddressSync(
    TXL_MINT,
    keypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  console.log(`📡 subscribing on-chain (free tier, level ${SERVICE_LEVEL_ID})...`);
  // the program requires the wallet's TxL token account to exist (even empty)
  const createAta = createAssociatedTokenAccountIdempotentInstruction(
    keypair.publicKey, // payer
    userTokenAccount,
    keypair.publicKey, // owner
    TXL_MINT,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const txSig = await (program.methods as any)
    .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
    .preInstructions([createAta])
    .accounts({
      user: keypair.publicKey,
      pricingMatrix: pricingMatrixPda,
      tokenMint: TXL_MINT,
      userTokenAccount,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("✅ subscribed:", txSig);

  console.log("🎟️  activating api access...");
  const { data: auth } = await axios.post(`${API_ORIGIN}/auth/guest/start`);
  const jwt: string = auth.token;

  const message = new TextEncoder().encode(
    `${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`
  );
  const walletSignature = Buffer.from(
    nacl.sign.detached(message, keypair.secretKey)
  ).toString("base64");

  const { data: activation } = await axios.post(
    `${API_ORIGIN}/api/token/activate`,
    { txSig, walletSignature, leagues: SELECTED_LEAGUES },
    { headers: { Authorization: `Bearer ${jwt}` } }
  );
  const apiToken: string = activation.token ?? activation;

  // save to .env.local (gitignored)
  const line = `TXLINE_API_TOKEN=${apiToken}\n`;
  if (fs.existsSync(ENV_PATH)) {
    const env = fs
      .readFileSync(ENV_PATH, "utf8")
      .split("\n")
      .filter((l) => !l.startsWith("TXLINE_API_TOKEN="))
      .join("\n");
    fs.writeFileSync(ENV_PATH, env.trimEnd() + "\n" + line);
  } else {
    fs.writeFileSync(ENV_PATH, line);
  }

  console.log("");
  console.log("🎉 done. api token saved to .env.local");
  console.log("   valid 4 weeks · free · real-time world cup data");
  console.log("   (the app fetches a fresh guest jwt at runtime — nothing else to do)");
}

main().catch((err) => {
  console.error("");
  console.error("❌ something failed:", err?.response?.data ?? err?.message ?? err);
  console.error("   safe to just run `npm run get-key` again.");
  process.exit(1);
});
