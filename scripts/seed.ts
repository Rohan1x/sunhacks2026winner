/**
 * Seed a demo RuleCash grant on the cluster in ANCHOR_PROVIDER_URL (default: localnet).
 *
 *   anchor build && npx ts-node scripts/seed.ts
 *
 * Creates: a mock USDC mint (Token-2022), a RuleCash mint with our transfer hook,
 * the grant, two approved merchants (one blocked category is left out on purpose),
 * two grantees funded with RuleCash, and writes:
 *   - scripts/.demo-keys/*.json   (demo keypairs, gitignored)
 *   - web/lib/demo.json           (public addresses for the web app)
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMintInstruction,
  createInitializeTransferHookInstruction,
  createMint,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import { Rulecash } from "../target/types/rulecash";
import idl from "../target/idl/rulecash.json";

const DECIMALS = 6;
const usd = (n: number) => new BN(Math.round(n * 10 ** DECIMALS));

// Backing asset token program. Mock USDC is Token-2022 (see README: classic ATA issue on local validator).
const USDC_PROGRAM = TOKEN_2022_PROGRAM_ID;

const CAT = { FOOD: 0, HARDWARE: 1, CASINO: 5 };
const ALLOWED_CATEGORIES = (1 << CAT.FOOD) | (1 << CAT.HARDWARE); // casino not allowed
const DAILY_CAP = usd(500);

const KEYS_DIR = path.join(__dirname, ".demo-keys");
const OUT_JSON = path.join(__dirname, "..", "web", "lib", "demo.json");

function saveKeypair(name: string, kp: Keypair) {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  fs.writeFileSync(path.join(KEYS_DIR, `${name}.json`), JSON.stringify(Array.from(kp.secretKey)));
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const issuer = (provider.wallet as anchor.Wallet).payer;
  const program = new Program<Rulecash>(idl as Rulecash, provider);

  const grantee1 = Keypair.generate();
  const grantee2 = Keypair.generate();
  const hardwareStore = Keypair.generate(); // category 1, approved
  const pizzaCo = Keypair.generate(); // category 0, approved
  const casino = Keypair.generate(); // category 5, added but blocked by grant
  const rulecash = Keypair.generate();

  for (const [name, kp] of Object.entries({ grantee1, grantee2, hardwareStore, pizzaCo, casino, rulecash })) {
    saveKeypair(name, kp);
  }

  // Fund wallets that need SOL for fees (merchants/grantees sign their own txs).
  const fund = async (to: PublicKey, sol: number) => {
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: issuer.publicKey, toPubkey: to, lamports: sol * LAMPORTS_PER_SOL })
    );
    await provider.sendAndConfirm(tx, []);
  };
  for (const kp of [grantee1, grantee2, hardwareStore, pizzaCo]) {
    await fund(kp.publicKey, 0.05);
  }

  // Mock USDC (Token-2022, 6 decimals), issuer holds 10,000.
  const usdcMint = await createMint(connection, issuer, issuer.publicKey, null, DECIMALS, undefined, undefined, USDC_PROGRAM);
  const usdcAta = (owner: PublicKey) => getAssociatedTokenAddressSync(usdcMint, owner, false, USDC_PROGRAM);
  const rcAta = (owner: PublicKey) => getAssociatedTokenAddressSync(rulecash.publicKey, owner, false, TOKEN_2022_PROGRAM_ID);

  const grantPda = PublicKey.findProgramAddressSync([Buffer.from("grant"), rulecash.publicKey.toBuffer()], program.programId)[0];
  const vaultPda = getAssociatedTokenAddressSync(usdcMint, grantPda, true, USDC_PROGRAM);
  const metaListPda = PublicKey.findProgramAddressSync([Buffer.from("extra-account-metas"), rulecash.publicKey.toBuffer()], program.programId)[0];
  const merchantPda = (w: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("merchant"), rulecash.publicKey.toBuffer(), w.toBuffer()], program.programId)[0];
  const spendPda = (w: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("spend"), rulecash.publicKey.toBuffer(), w.toBuffer()], program.programId)[0];

  // RuleCash: transfer hook -> our program, mint authority -> grant PDA.
  const mintLen = getMintLen([ExtensionType.TransferHook]);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);
  await provider.sendAndConfirm(
    new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: issuer.publicKey,
        newAccountPubkey: rulecash.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeTransferHookInstruction(rulecash.publicKey, issuer.publicKey, program.programId, TOKEN_2022_PROGRAM_ID),
      createInitializeMintInstruction(rulecash.publicKey, DECIMALS, grantPda, null, TOKEN_2022_PROGRAM_ID)
    ),
    [issuer, rulecash]
  );

  // Issuer USDC account + RuleCash/USDC accounts for everyone.
  const everyone = [grantee1, grantee2, hardwareStore, pizzaCo, casino];
  await provider.sendAndConfirm(
    new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(issuer.publicKey, usdcAta(issuer.publicKey), issuer.publicKey, usdcMint, USDC_PROGRAM),
      createMintToInstruction(usdcMint, usdcAta(issuer.publicKey), issuer.publicKey, BigInt(usd(10000).toString()), [], USDC_PROGRAM),
      ...everyone.flatMap((o) => [
        createAssociatedTokenAccountIdempotentInstruction(issuer.publicKey, rcAta(o.publicKey), o.publicKey, rulecash.publicKey, TOKEN_2022_PROGRAM_ID),
        createAssociatedTokenAccountIdempotentInstruction(issuer.publicKey, usdcAta(o.publicKey), o.publicKey, usdcMint, USDC_PROGRAM),
      ])
    ),
    [issuer]
  );

  // Grant + vault.
  await program.methods
    .initGrant(ALLOWED_CATEGORIES, DAILY_CAP)
    .accounts({
      issuer: issuer.publicKey,
      mint: rulecash.publicKey,
      usdcMint,
      grant: grantPda,
      vault: vaultPda,
      usdcTokenProgram: USDC_PROGRAM,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  await program.methods
    .initExtraAccountMetas()
    .accounts({ issuer: issuer.publicKey, mint: rulecash.publicKey, grant: grantPda, extraAccountMetaList: metaListPda })
    .rpc();

  // Merchants: two approved, one in a blocked category.
  const addMerchant = (w: PublicKey, category: number, cap: BN) =>
    program.methods
      .addMerchant(w, category, cap)
      .accounts({ issuer: issuer.publicKey, mint: rulecash.publicKey, grant: grantPda, merchant: merchantPda(w) })
      .rpc();
  await addMerchant(hardwareStore.publicKey, CAT.HARDWARE, usd(200));
  await addMerchant(pizzaCo.publicKey, CAT.FOOD, usd(60));
  await addMerchant(casino.publicKey, CAT.CASINO, usd(200));

  // Spend counters.
  for (const g of [grantee1, grantee2]) {
    await program.methods
      .initSpend(g.publicKey)
      .accounts({ payer: issuer.publicKey, mint: rulecash.publicKey, spend: spendPda(g.publicKey) })
      .rpc();
  }

  // Fund grantees: USDC locked in vault, RuleCash minted 1:1.
  const deposit = (to: Keypair, amount: BN) =>
    program.methods
      .depositAndMint(amount)
      .accounts({
        issuer: issuer.publicKey,
        mint: rulecash.publicKey,
        usdcMint,
        grant: grantPda,
        issuerUsdc: usdcAta(issuer.publicKey),
        vault: vaultPda,
        grantee: to.publicKey,
        granteeToken: rcAta(to.publicKey),
        usdcTokenProgram: USDC_PROGRAM,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  await deposit(grantee1, usd(500));
  await deposit(grantee2, usd(300));

  const out = {
    cluster: connection.rpcEndpoint,
    programId: program.programId.toBase58(),
    issuer: issuer.publicKey.toBase58(),
    rulecashMint: rulecash.publicKey.toBase58(),
    usdcMint: usdcMint.toBase58(),
    usdcTokenProgram: USDC_PROGRAM.toBase58(),
    grant: grantPda.toBase58(),
    vault: vaultPda.toBase58(),
    dailyCap: DAILY_CAP.toNumber() / 10 ** DECIMALS,
    allowedCategories: ALLOWED_CATEGORIES,
    grantees: [
      { name: "Team Alpha", wallet: grantee1.publicKey.toBase58() },
      { name: "Team Beta", wallet: grantee2.publicKey.toBase58() },
    ],
    merchants: [
      { name: "Campus Hardware Store", wallet: hardwareStore.publicKey.toBase58(), category: CAT.HARDWARE, perTxCap: 200 },
      { name: "Pizza Co", wallet: pizzaCo.publicKey.toBase58(), category: CAT.FOOD, perTxCap: 60 },
      { name: "Blocked Casino", wallet: casino.publicKey.toBase58(), category: CAT.CASINO, perTxCap: 200, blockedByGrant: true },
    ],
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
  console.log("Seeded RuleCash demo:");
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
