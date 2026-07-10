import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeAccountInstruction,
  createMintToInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { redis } from "./db";

/** devnet escrow — real onchain transactions, custodial wallets.
 *
 *  design (hackathon-honest):
 *  - every user gets a devnet keypair created invisibly behind their tg
 *    login (stored server-side; zero wallet popups for frens)
 *  - mock USDC is minted to users automatically (devnet faucet ux)
 *  - each tournament gets its own onchain vault token account owned by
 *    the escrow authority; every buy-in is a real SPL transfer
 *  - the anchor program in programs/escrow is the trustless upgrade
 *    path (PDA vault + permissionless refunds), documented in the tech doc
 */

const RPC = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";
const FAUCET_USDC = 1_000; // mock usdc auto-topup amount

let _conn: Connection | null = null;
export function connection(): Connection {
  if (!_conn) _conn = new Connection(RPC, "confirmed");
  return _conn;
}

export function escrowAuthority(): Keypair {
  const secret = process.env.SOLANA_ESCROW_SECRET;
  if (!secret) throw new Error("SOLANA_ESCROW_SECRET missing — run `npm run solana-setup`");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret) as number[]));
}

export function usdcMint(): PublicKey {
  const mint = process.env.SOLANA_USDC_MINT;
  if (!mint) throw new Error("SOLANA_USDC_MINT missing — run `npm run solana-setup`");
  return new PublicKey(mint);
}

export function isEscrowConfigured(): boolean {
  return Boolean(process.env.SOLANA_ESCROW_SECRET && process.env.SOLANA_USDC_MINT);
}

/** custodial devnet wallet per user — created silently on first use */
export async function getOrCreateUserWallet(userId: string): Promise<Keypair> {
  const key = `user:${userId}:wallet`;
  const stored = await redis().get<number[]>(key);
  if (stored) return Keypair.fromSecretKey(Uint8Array.from(stored));
  const kp = Keypair.generate();
  await redis().set(key, Array.from(kp.secretKey));
  return kp;
}

/** per-tournament onchain vault (token account owned by escrow authority) */
export async function getOrCreateVault(code: string): Promise<PublicKey> {
  const key = `tour:${code}:vault`;
  const stored = await redis().get<string>(key);
  if (stored) return new PublicKey(stored);

  const conn = connection();
  const escrow = escrowAuthority();
  const vault = Keypair.generate();
  const rent = await conn.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: escrow.publicKey,
      newAccountPubkey: vault.publicKey,
      space: ACCOUNT_SIZE,
      lamports: rent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeAccountInstruction(vault.publicKey, usdcMint(), escrow.publicKey)
  );
  await sendAndConfirmTransaction(conn, tx, [escrow, vault]);
  await redis().set(key, vault.publicKey.toBase58());
  return vault.publicKey;
}

/** fund a tournament: auto-topup mock usdc if needed, then transfer the
 *  buy-in from the user's wallet into the tournament vault. returns the
 *  transaction signature (viewable on explorer). */
export async function fundTournament(
  code: string,
  userId: string,
  buyInUsdc: number
): Promise<{ txSig: string; vault: string }> {
  const conn = connection();
  const escrow = escrowAuthority();
  const mint = usdcMint();
  const user = await getOrCreateUserWallet(userId);
  const vault = await getOrCreateVault(code);
  const amount = BigInt(Math.round(buyInUsdc * 1_000_000)); // 6 dp

  const userAta = getAssociatedTokenAddressSync(mint, user.publicKey);

  const tx = new Transaction();
  // ensure the user's token account exists (escrow pays)
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      escrow.publicKey,
      userAta,
      user.publicKey,
      mint
    )
  );

  // devnet faucet: top up mock usdc when short
  let balance = 0n;
  try {
    balance = (await getAccount(conn, userAta)).amount;
  } catch {
    /* account created in this tx */
  }
  if (balance < amount) {
    tx.add(
      createMintToInstruction(
        mint,
        userAta,
        escrow.publicKey,
        BigInt(FAUCET_USDC * 1_000_000)
      )
    );
  }

  // the actual buy-in: user → tournament vault
  tx.add(createTransferInstruction(userAta, vault, user.publicKey, amount));

  // escrow pays fees; user signs the transfer
  tx.feePayer = escrow.publicKey;
  const txSig = await sendAndConfirmTransaction(conn, tx, [escrow, user]);
  return { txSig, vault: vault.toBase58() };
}

/** current onchain pool balance for a tournament (usdc) */
export async function vaultBalance(code: string): Promise<number | null> {
  const stored = await redis().get<string>(`tour:${code}:vault`);
  if (!stored) return null;
  try {
    const acc = await getAccount(connection(), new PublicKey(stored));
    return Number(acc.amount) / 1_000_000;
  } catch {
    return null;
  }
}

export function explorerUrl(txSig: string): string {
  return `https://explorer.solana.com/tx/${txSig}?cluster=devnet`;
}
