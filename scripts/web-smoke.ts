/**
 * Headless smoke test of the issuer, grantee and merchant write paths.
 * Uses the same builders as the web pages (web/lib/actions.ts), so the test covers the production code path.
 * Issuer key = ANCHOR_WALLET. Runs against the seeded demo state (web/lib/demo.json).
 *
 *   ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json \
 *     npx ts-node --transpile-only -O '{"module":"commonjs"}' scripts/web-smoke.ts
 *
 * Does not exercise the React UI or a browser wallet.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAccount, getMint } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import { expect } from "chai";
import { Rulecash } from "../target/types/rulecash";
import idl from "../target/idl/rulecash.json";
import {
  buildAddMerchant,
  buildFundGrantee,
  buildPay,
  buildRedeem,
  buildSetMerchant,
  buildSetPolicy,
  prepare,
  sendSigned,
} from "../web/lib/actions";
import { DEMO, GRANT, MINT, USDC_PROGRAM, VAULT, merchantPda, rcAta, usdcAta } from "../web/lib/chain";

const KEYS = path.join(__dirname, ".demo-keys");
const loadKey = (n: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(KEYS, `${n}.json`), "utf8"))));

const DEC = 6;

async function main() {
  const base = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(base.connection, base.wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  const conn = provider.connection;
  const program = new Program<Rulecash>(idl as Rulecash, provider);
  const issuerKp = (provider.wallet as anchor.Wallet).payer;
  const issuer = issuerKp.publicKey;

  const hardware = new PublicKey(DEMO.merchants[0].wallet);
  const alpha = loadKey("grantee1");

  // Sign with fee payer plus any extra signers, then send. Returns the on-chain error name, or "" on success.
  async function run(tx: Transaction, feePayer: Keypair, extra: Keypair[] = [], skipPreflight = false): Promise<string> {
    await prepare(conn, tx, feePayer.publicKey);
    const signers = [feePayer, ...extra.filter((k) => !k.publicKey.equals(feePayer.publicKey))];
    tx.sign(...signers);
    const r = await sendSigned(conn, tx, skipPreflight);
    return r.error ?? "";
  }
  const mustPass = async (tx: Transaction, feePayer: Keypair, extra: Keypair[] = []) => {
    const err = await run(tx, feePayer, extra);
    if (err) throw new Error(`expected success, got ${err}`);
  };

  const bal = async (addr: PublicKey, prog = TOKEN_2022_PROGRAM_ID) =>
    Number((await getAccount(conn, addr, "confirmed", prog)).amount) / 10 ** DEC;

  const fundSol = (to: PublicKey, sol: number) =>
    mustPass(
      new Transaction().add(SystemProgram.transfer({ fromPubkey: issuer, toPubkey: to, lamports: sol * LAMPORTS_PER_SOL })),
      issuerKp
    );

  // 1. setPolicy: change the daily cap, check it, restore it.
  const grantBefore = await program.account.grant.fetch(GRANT);
  const originalCap = Number(grantBefore.dailyCap.toString()) / 10 ** DEC;
  await mustPass(await buildSetPolicy(program, issuer, grantBefore.allowedCategories, 600), issuerKp);
  expect((await program.account.grant.fetch(GRANT)).dailyCap.toString()).to.equal(String(600 * 10 ** DEC));
  await mustPass(await buildSetPolicy(program, issuer, grantBefore.allowedCategories, originalCap), issuerKp);
  console.log("✓ setPolicy changes and restores the daily cap");

  // 2. addMerchant for a fresh wallet. Its RuleCash account is created later by the pay builder.
  const newMerchant = Keypair.generate();
  await fundSol(newMerchant.publicKey, 0.05);
  await mustPass(await buildAddMerchant(program, issuer, newMerchant.publicKey, 0, 50), issuerKp);
  expect((await program.account.merchant.fetch(merchantPda(newMerchant.publicKey))).active).to.equal(true);
  console.log("✓ addMerchant approves a new wallet");

  // 3. Pause the hardware store: a payment is rejected on-chain. Reactivate: the same payment passes.
  const hw = await program.account.merchant.fetch(merchantPda(hardware));
  const hwCap = Number(hw.perTxCap.toString()) / 10 ** DEC;
  await mustPass(await buildSetMerchant(program, issuer, hardware, hw.category, hwCap, false), issuerKp);
  const paused = await run(buildPay(alpha.publicKey, hardware, 1), alpha, [], true);
  expect(paused).to.equal("NotApprovedMerchant");
  await mustPass(await buildSetMerchant(program, issuer, hardware, hw.category, hwCap, true), issuerKp);
  expect(await run(buildPay(alpha.publicKey, hardware, 1), alpha, [], true)).to.equal("");
  console.log("✓ paused merchant rejects on-chain, reactivated merchant accepts");

  // 4. Fund a brand-new grantee: buildFundGrantee creates the ATA and the spend counter in one transaction.
  const grantee3 = Keypair.generate();
  await fundSol(grantee3.publicKey, 0.05);
  await mustPass(await buildFundGrantee(program, issuer, grantee3.publicKey, 40, true), issuerKp);
  expect(await bal(rcAta(grantee3.publicKey))).to.equal(40);
  console.log("✓ fund brand-new grantee (ATA and spend counter in one transaction)");

  // 5. New grantee pays the approved merchant. buildPay creates the merchant's RuleCash account if missing.
  expect(await run(buildPay(grantee3.publicKey, newMerchant.publicKey, 10), grantee3, [], false)).to.equal("");
  expect(await bal(rcAta(newMerchant.publicKey))).to.equal(10);
  console.log("✓ grantee pays approved merchant (merchant account created by the builder)");

  // 6. Merchant redeems 5 RuleCash for USDC. Vault must still back supply.
  const usdcBefore = await bal(usdcAta(newMerchant.publicKey), USDC_PROGRAM).catch(() => 0);
  await fundSol(newMerchant.publicKey, 0.02);
  await mustPass(await buildRedeem(program, newMerchant.publicKey, 5), newMerchant);
  expect(await bal(usdcAta(newMerchant.publicKey), USDC_PROGRAM)).to.equal(usdcBefore + 5);
  const supply = Number((await getMint(conn, MINT, "confirmed", TOKEN_2022_PROGRAM_ID)).supply) / 10 ** DEC;
  expect(await bal(VAULT, USDC_PROGRAM)).to.equal(supply);
  console.log("✓ merchant redeems; vault still equals supply");

  console.log("smoke: all checks passed");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e?.message ?? e, e?.logs ?? "", e?.stack ?? "");
  process.exit(1);
});
