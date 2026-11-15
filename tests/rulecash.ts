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
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMintInstruction,
  createInitializeTransferHookInstruction,
  createMintToInstruction,
  createTransferCheckedWithTransferHookInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import { Rulecash } from "../target/types/rulecash";

const DECIMALS = 6;
const usd = (n: number) => new BN(Math.round(n * 10 ** DECIMALS));

describe("rulecash", () => {
  // Use confirmed commitment so balance reads right after a send see the new state.
  const base = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(base.connection, base.wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = anchor.workspace.Rulecash as Program<Rulecash>;
  const connection = provider.connection;

  const issuer = (provider.wallet as anchor.Wallet).payer;
  const grantee = Keypair.generate();
  const grantee2 = Keypair.generate();
  const merchant = Keypair.generate(); // category 1 (approved)
  const merchantOther = Keypair.generate(); // category 5 (blocked by grant)
  const stranger = Keypair.generate(); // never approved
  const mint = Keypair.generate();

  const CAT_FOOD = 1; // bit 1
  const CAT_CASINO = 5; // bit 5, not allowed
  const ALLOWED = 1 << CAT_FOOD;
  const DAILY_CAP = usd(500);

  const ata = (owner: PublicKey) =>
    getAssociatedTokenAddressSync(mint.publicKey, owner, false, TOKEN_2022_PROGRAM_ID);

  const pda = (seeds: (Buffer | Uint8Array)[]) =>
    PublicKey.findProgramAddressSync(seeds, program.programId)[0];

  const grantPda = pda([Buffer.from("grant"), mint.publicKey.toBuffer()]);
  const metaListPda = pda([Buffer.from("extra-account-metas"), mint.publicKey.toBuffer()]);
  const merchantPda = (wallet: PublicKey) =>
    pda([Buffer.from("merchant"), mint.publicKey.toBuffer(), wallet.toBuffer()]);
  const spendPda = (owner: PublicKey) =>
    pda([Buffer.from("spend"), mint.publicKey.toBuffer(), owner.toBuffer()]);

  // Asserts a tx fails with the given Anchor error name.
  async function expectRevert(p: Promise<unknown>, errorName: string) {
    let failed = false;
    try {
      await p;
    } catch (e: any) {
      failed = true;
      const text = [String(e), ...(e?.logs ?? [])].join("\n");
      expect(text, `expected ${errorName}`).to.include(errorName);
    }
    expect(failed, `expected revert ${errorName}`).to.equal(true);
  }

  async function transferRuleCash(from: Keypair, to: PublicKey, amount: BN) {
    const ix = await createTransferCheckedWithTransferHookInstruction(
      connection,
      ata(from.publicKey),
      mint.publicKey,
      to,
      from.publicKey,
      BigInt(amount.toString()),
      DECIMALS,
      [],
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    return provider.sendAndConfirm(new Transaction().add(ix), [from]);
  }

  before(async () => {
    for (const kp of [grantee, grantee2, merchant, merchantOther, stranger]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
    }

    // Token-2022 mint with TransferHook pointing at our program.
    const mintLen = getMintLen([ExtensionType.TransferHook]);
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);
    await provider.sendAndConfirm(
      new Transaction()
        .add(
          SystemProgram.createAccount({
            fromPubkey: issuer.publicKey,
            newAccountPubkey: mint.publicKey,
            space: mintLen,
            lamports,
            programId: TOKEN_2022_PROGRAM_ID,
          }),
          createInitializeTransferHookInstruction(
            mint.publicKey,
            issuer.publicKey,
            program.programId,
            TOKEN_2022_PROGRAM_ID
          ),
          createInitializeMintInstruction(
            mint.publicKey,
            DECIMALS,
            issuer.publicKey,
            null,
            TOKEN_2022_PROGRAM_ID
          )
        ),
      [issuer, mint]
    );

    // Token accounts for everyone, then mint 1000 RuleCash to the grantee.
    const owners = [grantee, grantee2, merchant, merchantOther, stranger];
    await provider.sendAndConfirm(
      new Transaction().add(
        ...owners.map((o) =>
          createAssociatedTokenAccountIdempotentInstruction(
            issuer.publicKey,
            ata(o.publicKey),
            o.publicKey,
            mint.publicKey,
            TOKEN_2022_PROGRAM_ID
          )
        ),
        createMintToInstruction(
          mint.publicKey,
          ata(grantee.publicKey),
          issuer.publicKey,
          BigInt(usd(1000).toString()),
          [],
          TOKEN_2022_PROGRAM_ID
        )
      ),
      [issuer]
    );

    // Program setup.
    await program.methods
      .initGrant(ALLOWED, DAILY_CAP)
      .accounts({ issuer: issuer.publicKey, mint: mint.publicKey, grant: grantPda })
      .rpc();

    await program.methods
      .initExtraAccountMetas()
      .accounts({
        issuer: issuer.publicKey,
        mint: mint.publicKey,
        grant: grantPda,
        extraAccountMetaList: metaListPda,
      })
      .rpc();

    await program.methods
      .addMerchant(merchant.publicKey, CAT_FOOD, usd(200))
      .accounts({
        issuer: issuer.publicKey,
        mint: mint.publicKey,
        grant: grantPda,
        merchant: merchantPda(merchant.publicKey),
      })
      .rpc();

    await program.methods
      .addMerchant(merchantOther.publicKey, CAT_CASINO, usd(200))
      .accounts({
        issuer: issuer.publicKey,
        mint: mint.publicKey,
        grant: grantPda,
        merchant: merchantPda(merchantOther.publicKey),
      })
      .rpc();

    for (const g of [grantee, grantee2]) {
      await program.methods
        .initSpend(g.publicKey)
        .accounts({ payer: issuer.publicKey, mint: mint.publicKey, spend: spendPda(g.publicKey) })
        .rpc();
    }
  });

  it("allows a payment to an approved merchant within caps", async () => {
    await transferRuleCash(grantee, ata(merchant.publicKey), usd(150));
    const bal = await getAccount(connection, ata(merchant.publicKey), "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(bal.amount.toString()).to.equal(usd(150).toString());
    const spend = await program.account.spend.fetch(spendPda(grantee.publicKey));
    expect(spend.spentToday.toString()).to.equal(usd(150).toString());
  });

  it("blocks a transfer to a non-merchant wallet", async () => {
    await expectRevert(transferRuleCash(grantee, ata(stranger.publicKey), usd(10)), "NotApprovedMerchant");
  });

  it("blocks a payment above the merchant per-tx cap", async () => {
    await expectRevert(transferRuleCash(grantee, ata(merchant.publicKey), usd(300)), "OverTxCap");
  });

  it("blocks a merchant whose category the grant does not allow", async () => {
    await expectRevert(transferRuleCash(grantee, ata(merchantOther.publicKey), usd(10)), "CategoryBlocked");
  });

  it("enforces the daily cap per grantee", async () => {
    // spent 150 so far; 200 more is 350 (ok), another 200 is 550 (over 500)
    await transferRuleCash(grantee, ata(merchant.publicKey), usd(200));
    await expectRevert(transferRuleCash(grantee, ata(merchant.publicKey), usd(200)), "OverDailyCap");
  });

  it("tracks the daily cap separately per grantee", async () => {
    // grantee is at its cap, but grantee2 has its own fresh counter.
    // grantee2 needs funds first (issuer mints to it).
    await provider.sendAndConfirm(
      new Transaction().add(
        createMintToInstruction(
          mint.publicKey,
          ata(grantee2.publicKey),
          issuer.publicKey,
          BigInt(usd(1000).toString()),
          [],
          TOKEN_2022_PROGRAM_ID
        )
      ),
      [issuer]
    );
    await transferRuleCash(grantee2, ata(merchant.publicKey), usd(200));
    const spend = await program.account.spend.fetch(spendPda(grantee2.publicKey));
    expect(spend.spentToday.toString()).to.equal(usd(200).toString());
  });

  it("blocks payments to a merchant that has been deactivated", async () => {
    await program.methods
      .setMerchant(merchant.publicKey, CAT_FOOD, usd(200), false)
      .accounts({ issuer: issuer.publicKey, mint: mint.publicKey, grant: grantPda, merchant: merchantPda(merchant.publicKey) })
      .rpc();
    await expectRevert(transferRuleCash(grantee2, ata(merchant.publicKey), usd(10)), "NotApprovedMerchant");

    await program.methods
      .setMerchant(merchant.publicKey, CAT_FOOD, usd(200), true)
      .accounts({ issuer: issuer.publicKey, mint: mint.publicKey, grant: grantPda, merchant: merchantPda(merchant.publicKey) })
      .rpc();
  });

  it("allows a payment again after the merchant is reactivated", async () => {
    await transferRuleCash(grantee2, ata(merchant.publicKey), usd(25));
  });

  it("rejects a non-issuer trying to add a merchant", async () => {
    const attacker = grantee2;
    const target = Keypair.generate();
    let failed = false;
    try {
      await program.methods
        .addMerchant(target.publicKey, CAT_FOOD, usd(100))
        .accounts({
          issuer: attacker.publicKey,
          mint: mint.publicKey,
          grant: grantPda,
          merchant: merchantPda(target.publicKey),
        })
        .signers([attacker])
        .rpc();
    } catch (_e) {
      failed = true;
    }
    expect(failed).to.equal(true);
  });
});
