/**
 * Send one good payment and three that the chain must reject, using the demo keys.
 * Uses skipPreflight so rejected transactions land on-chain and show as blocked in the feed.
 *
 *   npx ts-node scripts/demo-activity.ts      (after scripts/seed.ts; ANCHOR_PROVIDER_URL set)
 */
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedWithTransferHookInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const DECIMALS = 6;
const KEYS = path.join(__dirname, ".demo-keys");
const DEMO = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "web", "lib", "demo.json"), "utf8"));

const loadKey = (name: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(KEYS, `${name}.json`), "utf8"))));

async function send(
  connection: Connection,
  from: Keypair,
  to: PublicKey,
  amount: number,
  label: string
) {
  const mint = new PublicKey(DEMO.rulecashMint);
  const ix = await createTransferCheckedWithTransferHookInstruction(
    connection,
    getAssociatedTokenAddressSync(mint, from.publicKey, false, TOKEN_2022_PROGRAM_ID),
    mint,
    getAssociatedTokenAddressSync(mint, to, false, TOKEN_2022_PROGRAM_ID),
    from.publicKey,
    BigInt(Math.round(amount * 10 ** DECIMALS)),
    DECIMALS,
    [],
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );
  const tx = new Transaction().add(ix);
  tx.feePayer = from.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  tx.sign(from);

  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  const res = await connection.confirmTransaction(sig, "confirmed");
  if (res.value.err) {
    const info = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    const code = (info?.meta?.logMessages ?? []).join("\n").match(/Error Code: (\w+)/)?.[1] ?? "error";
    console.log(`✗ ${label}: blocked (${code})  ${sig}`);
  } else {
    console.log(`✓ ${label}: paid ${amount}  ${sig}`);
  }
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  const connection = provider.connection;

  const alpha = loadKey("grantee1");
  const beta = loadKey("grantee2");
  const hardware = new PublicKey(DEMO.merchants[0].wallet);
  const casino = new PublicKey(DEMO.merchants[2].wallet);

  await send(connection, alpha, hardware, 25, "Team Alpha → Campus Hardware Store");
  await send(connection, alpha, beta.publicKey, 10, "Team Alpha → non-merchant wallet");
  await send(connection, alpha, hardware, 250, "Team Alpha → Campus Hardware Store (over per-tx cap)");
  await send(connection, alpha, casino, 10, "Team Alpha → Blocked Casino (category not allowed)");
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
