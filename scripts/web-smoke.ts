/**
 * Headless smoke test of the issuer, grantee and merchant write paths the web app uses.
 * Runs against the seeded demo state (web/lib/demo.json). Issuer key = ANCHOR_WALLET.
 *
 *   ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json \
 *     npx ts-node --transpile-only scripts/web-smoke.ts
 *
 * Mirrors the account maps in web/app/issuer, web/app/merchant and web/app/pay.
 * It does not exercise the React UI or a browser wallet.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedWithTransferHookInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import { Rulecash } from "../target/types/rulecash";
import idl from "../target/idl/rulecash.json";
import { expect } from "chai";

const DEMO = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "web", "lib", "demo.json"), "utf8"));
const KEYS = path.join(__dirname, ".demo-keys");
const loadKey = (n: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(KEYS, `${n}.json`), "utf8"))));

const DEC = 6;
const amt = (n: number) => new BN(Math.round(n * 10 ** DEC));
const MINT = new PublicKey(DEMO.rulecashMint);
const GRANT = new PublicKey(DEMO.grant);
const VAULT = new PublicKey(DEMO.vault);
const USDC_MINT = new PublicKey(DEMO.usdcMint);
const USDC_PROGRAM = new PublicKey(DEMO.usdcTokenProgram);

async function main() {
  const base = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(base.connection, base.wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  const conn = provider.connection;
  const program = new Program<Rulecash>(idl as Rulecash, provider);
  const issuer = provider.wallet.publicKey;

  const rcAta = (o: PublicKey) => getAssociatedTokenAddressSync(MINT, o, false, TOKEN_2022_PROGRAM_ID);
  const usdcAta = (o: PublicKey) => getAssociatedTokenAddressSync(USDC_MINT, o, false, USDC_PROGRAM);
  const pda = (seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, program.programId)[0];
  const merchantPda = (w: PublicKey) => pda([Buffer.from("merchant"), MINT.toBuffer(), w.toBuffer()]);
  const spendPda = (w: PublicKey) => pda([Buffer.from("spend"), MINT.toBuffer(), w.toBuffer()]);
  const hardware = new PublicKey(DEMO.merchants[0].wallet);
  const alpha = loadKey("grantee1");

  const bal = async (addr: PublicKey, prog = TOKEN_2022_PROGRAM_ID) =>
    Number((await getAccount(conn, addr, "confirmed", prog)).amount) / 10 ** DEC;

  // Send a RuleCash transfer; returns the error name ("" when it succeeds).
  async function transfer(from: Keypair, to: PublicKey, amount: number): Promise<string> {
    const ix = await createTransferCheckedWithTransferHookInstruction(
      conn, rcAta(from.publicKey), MINT, rcAta(to), from.publicKey,
      BigInt(Math.round(amount * 10 ** DEC)), DEC, [], "confirmed", TOKEN_2022_PROGRAM_ID
    );
    const tx = new Transaction().add(ix);
    tx.feePayer = from.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;
    tx.sign(from);
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    const res = await conn.confirmTransaction(sig, "confirmed");
    if (!res.value.err) return "";
    const info = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    return (info?.meta?.logMessages ?? []).join("\n").match(/Error Code: (\w+)/)?.[1] ?? "error";
  }

  const fund = async (to: PublicKey, sol: number) =>
    provider.sendAndConfirm(new Transaction().add(
      SystemProgram.transfer({ fromPubkey: issuer, toPubkey: to, lamports: sol * LAMPORTS_PER_SOL })
    ));

  // 1. setPolicy: change the daily cap, check it, restore it.
  const grantBefore = await program.account.grant.fetch(GRANT);
  const bits = grantBefore.allowedCategories;
  await program.methods.setPolicy(bits, amt(600))
    .accounts({ issuer, mint: MINT, grant: GRANT } as any).rpc();
  expect((await program.account.grant.fetch(GRANT)).dailyCap.toString()).to.equal(amt(600).toString());
  await program.methods.setPolicy(bits, grantBefore.dailyCap)
    .accounts({ issuer, mint: MINT, grant: GRANT } as any).rpc();
  console.log("✓ setPolicy changes and restores the daily cap");

  // 2. addMerchant for a fresh wallet.
  const newMerchant = Keypair.generate();
  await fund(newMerchant.publicKey, 0.05);
  await provider.sendAndConfirm(new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(issuer, rcAta(newMerchant.publicKey), newMerchant.publicKey, MINT, TOKEN_2022_PROGRAM_ID)));
  await program.methods.addMerchant(newMerchant.publicKey, 0, amt(50))
    .accounts({ issuer, mint: MINT, grant: GRANT, merchant: merchantPda(newMerchant.publicKey) } as any).rpc();
  expect((await program.account.merchant.fetch(merchantPda(newMerchant.publicKey))).active).to.equal(true);
  console.log("✓ addMerchant approves a new wallet");

  // 3. Pause the hardware store: transfers are blocked. Reactivate: they pass again.
  const hw = await program.account.merchant.fetch(merchantPda(hardware));
  const setHw = (active: boolean) => program.methods
    .setMerchant(hardware, hw.category, hw.perTxCap, active)
    .accounts({ issuer, mint: MINT, grant: GRANT, merchant: merchantPda(hardware) } as any).rpc();
  await setHw(false);
  expect(await transfer(alpha, hardware, 1)).to.equal("NotApprovedMerchant");
  await setHw(true);
  expect(await transfer(alpha, hardware, 1)).to.equal("");
  console.log("✓ pause blocks, reactivate allows");

  // 4. Fund a brand-new grantee: needs ATA + initSpend pre-instructions in one tx.
  const grantee3 = Keypair.generate();
  await fund(grantee3.publicKey, 0.05);
  const pre = [
    createAssociatedTokenAccountIdempotentInstruction(issuer, rcAta(grantee3.publicKey), grantee3.publicKey, MINT, TOKEN_2022_PROGRAM_ID),
    await program.methods.initSpend(grantee3.publicKey)
      .accounts({ payer: issuer, mint: MINT, spend: spendPda(grantee3.publicKey) } as any).instruction(),
  ];
  await program.methods.depositAndMint(amt(40))
    .accounts({
      issuer, mint: MINT, usdcMint: USDC_MINT, grant: GRANT, issuerUsdc: usdcAta(issuer), vault: VAULT,
      grantee: grantee3.publicKey, granteeToken: rcAta(grantee3.publicKey),
      usdcTokenProgram: USDC_PROGRAM, tokenProgram: TOKEN_2022_PROGRAM_ID,
    } as any)
    .preInstructions(pre).rpc();
  expect(await bal(rcAta(grantee3.publicKey))).to.equal(40);
  console.log("✓ fund brand-new grantee (ATA + initSpend in one tx)");

  // 5. New grantee pays the approved merchant.
  expect(await transfer(grantee3, newMerchant.publicKey, 10)).to.equal("");
  expect(await bal(rcAta(newMerchant.publicKey))).to.equal(10);
  console.log("✓ grantee pays approved merchant");

  // 6. Merchant redeems 5 RuleCash for USDC; vault must still back supply.
  const usdcBefore = await bal(usdcAta(newMerchant.publicKey), USDC_PROGRAM).catch(() => 0);
  await fund(newMerchant.publicKey, 0.02);
  await program.methods.redeem(amt(5))
    .accounts({
      merchant: newMerchant.publicKey, mint: MINT, usdcMint: USDC_MINT, grant: GRANT,
      merchantAccount: merchantPda(newMerchant.publicKey), merchantRulecash: rcAta(newMerchant.publicKey),
      merchantUsdc: usdcAta(newMerchant.publicKey), vault: VAULT,
      tokenProgram: TOKEN_2022_PROGRAM_ID, usdcTokenProgram: USDC_PROGRAM,
    } as any)
    .preInstructions([createAssociatedTokenAccountIdempotentInstruction(newMerchant.publicKey, usdcAta(newMerchant.publicKey), newMerchant.publicKey, USDC_MINT, USDC_PROGRAM)])
    .signers([newMerchant]).rpc();
  expect(await bal(usdcAta(newMerchant.publicKey), USDC_PROGRAM)).to.equal(usdcBefore + 5);
  const supply = Number((await getMint(conn, MINT, "confirmed", TOKEN_2022_PROGRAM_ID)).supply) / 10 ** DEC;
  expect(await bal(VAULT, USDC_PROGRAM)).to.equal(supply);
  console.log("✓ merchant redeems; vault still equals supply");

  console.log("smoke: all checks passed");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
