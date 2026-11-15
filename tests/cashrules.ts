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
  createTransferCheckedWithTransferHookInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  getMintLen,
} from "@solana/spl-token";
import { expect } from "chai";
import { Cashrules } from "../target/types/cashrules";

const DECIMALS = 6;
// Backing asset token program. Mock USDC is Token-2022 here: classic-token ATA creation
// fails on the local Agave 4.x validator. Program supports both via token_interface.
const USDC_PROGRAM = TOKEN_2022_PROGRAM_ID;
const usd = (n: number) => new BN(Math.round(n * 10 ** DECIMALS));

describe("cashrules", () => {
  // Confirmed commitment so reads right after a send see the new state.
  const base = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(base.connection, base.wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = anchor.workspace.Cashrules as Program<Cashrules>;
  const connection = provider.connection;

  const issuer = (provider.wallet as anchor.Wallet).payer;
  const grantee = Keypair.generate();
  const grantee2 = Keypair.generate();
  const merchant = Keypair.generate(); // category 1 (approved)
  const merchantOther = Keypair.generate(); // category 5 (blocked by grant)
  const stranger = Keypair.generate(); // never approved
  const mint = Keypair.generate(); // CashRules (Token-2022, transfer hook)

  const CAT_FOOD = 1;
  const CAT_CASINO = 5;
  const ALLOWED = 1 << CAT_FOOD;
  const DAILY_CAP = usd(500);

  // Backing asset: classic SPL token, 6 decimals.
  let usdcMint: PublicKey;

  // ---- address helpers
  const ata = (owner: PublicKey) =>
    getAssociatedTokenAddressSync(mint.publicKey, owner, false, TOKEN_2022_PROGRAM_ID);
  const usdcAta = (owner: PublicKey) =>
    getAssociatedTokenAddressSync(usdcMint, owner, false, USDC_PROGRAM);
  const pda = (seeds: (Buffer | Uint8Array)[]) =>
    PublicKey.findProgramAddressSync(seeds, program.programId)[0];

  const grantPda = pda([Buffer.from("grant"), mint.publicKey.toBuffer()]);
  // Set in before(), once usdcMint exists.
  let vaultPda: PublicKey;
  const metaListPda = pda([Buffer.from("extra-account-metas"), mint.publicKey.toBuffer()]);
  const PROGRAM_ID = program.programId;
  const bal = async (addr: PublicKey) =>
    Number((await getAccount(connection, addr, "confirmed", TOKEN_2022_PROGRAM_ID)).amount) / 10 ** DECIMALS;
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

  async function transferCashRules(from: Keypair, to: PublicKey, amount: BN) {
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

  // Issuer locks USDC and mints CashRules to `to`.
  const depositAndMint = (to: PublicKey, amount: BN) =>
    program.methods
      .depositAndMint(amount)
      .accounts({
        issuer: issuer.publicKey,
        mint: mint.publicKey,
        usdcMint,
        grant: grantPda,
        issuerUsdc: usdcAta(issuer.publicKey),
        vault: vaultPda,
        grantee: to,
        granteeToken: ata(to),
        usdcTokenProgram: USDC_PROGRAM,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

  const redeem = (merchantKp: Keypair, amount: BN) =>
    program.methods
      .redeem(amount)
      .accounts({
        merchant: merchantKp.publicKey,
        mint: mint.publicKey,
        usdcMint,
        grant: grantPda,
        merchantAccount: merchantPda(merchantKp.publicKey),
        merchantCashrules: ata(merchantKp.publicKey),
        merchantUsdc: usdcAta(merchantKp.publicKey),
        vault: vaultPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        usdcTokenProgram: USDC_PROGRAM,
      })
      .signers([merchantKp])
      .rpc();

  // Token-2022 mint with TransferHook pointing at this program and the given mint authority.
  async function createHookMint(kp: Keypair, mintAuthority: PublicKey) {
    const mintLen = getMintLen([ExtensionType.TransferHook]);
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: issuer.publicKey,
          newAccountPubkey: kp.publicKey,
          space: mintLen,
          lamports,
          programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeTransferHookInstruction(
          kp.publicKey,
          issuer.publicKey,
          program.programId,
          TOKEN_2022_PROGRAM_ID
        ),
        createInitializeMintInstruction(
          kp.publicKey,
          DECIMALS,
          mintAuthority,
          null,
          TOKEN_2022_PROGRAM_ID
        )
      ),
      [issuer, kp]
    );
  }

  before(async () => {
    for (const kp of [grantee, grantee2, merchant, merchantOther, stranger]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
    }

    // USDC-like backing asset.
    usdcMint = await createMint(connection, issuer, issuer.publicKey, null, DECIMALS, undefined, undefined, USDC_PROGRAM);
    vaultPda = getAssociatedTokenAddressSync(usdcMint, grantPda, true, USDC_PROGRAM);
    await new Promise((r) => setTimeout(r, 2000)); // let the mint account reach the confirmed view before using it
    await provider.sendAndConfirm(
      new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          issuer.publicKey,
          usdcAta(issuer.publicKey),
          issuer.publicKey,
          usdcMint,
          USDC_PROGRAM
        ),
        createMintToInstruction(
          usdcMint,
          usdcAta(issuer.publicKey),
          issuer.publicKey,
          BigInt(usd(10000).toString()),
          [],
          USDC_PROGRAM
        )
      ),
      [issuer]
    );

    // CashRules mint: mint authority is the grant PDA, so only deposit_and_mint can issue.
    await createHookMint(mint, grantPda);

    // Token accounts for CashRules and USDC.
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
        ...owners.map((o) =>
          createAssociatedTokenAccountIdempotentInstruction(
            issuer.publicKey,
            usdcAta(o.publicKey),
            o.publicKey,
            usdcMint,
            USDC_PROGRAM
          )
        )
      ),
      [issuer]
    );

    // Program setup.
    await program.methods
      .initGrant(ALLOWED, DAILY_CAP)
      .accounts({
        issuer: issuer.publicKey,
        mint: mint.publicKey,
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

    // Fund grantees: USDC locked in vault, CashRules minted 1:1.
    await depositAndMint(grantee.publicKey, usd(1000));
    await depositAndMint(grantee2.publicKey, usd(1000));

    // Exception escrow: the issuer's RuleCash account holds escrowed funds; forfeits go to a treasury account.
    await provider.sendAndConfirm(
      new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(issuer.publicKey, ata(issuer.publicKey), issuer.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
        createAssociatedTokenAccountIdempotentInstruction(issuer.publicKey, ata(treasury.publicKey), treasury.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID)
      ),
      [issuer]
    );
    await program.methods
      .setExceptionEscrow()
      .accounts({ issuer: issuer.publicKey, mint: mint.publicKey, grant: grantPda, escrowToken: ata(issuer.publicKey) })
      .rpc();
    await program.methods
      .initSpend(issuer.publicKey)
      .accounts({ payer: issuer.publicKey, mint: mint.publicKey, spend: spendPda(issuer.publicKey) })
      .rpc();
  });

  // ------------------------------------------------------------ backing

  it("deposit_and_mint locks USDC 1:1 and mints CashRules", async () => {
    const vault = await getAccount(connection, vaultPda, "confirmed", USDC_PROGRAM);
    expect(vault.amount.toString()).to.equal(usd(2000).toString());
    const g = await getAccount(connection, ata(grantee.publicKey), "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(g.amount.toString()).to.equal(usd(1000).toString());
  });

  it("rejects deposit_and_mint from a non-issuer", async () => {
    await expectRevert(
      program.methods
        .depositAndMint(usd(1))
        .accounts({
          issuer: grantee.publicKey,
          mint: mint.publicKey,
          usdcMint,
          grant: grantPda,
          issuerUsdc: usdcAta(grantee.publicKey),
          vault: vaultPda,
          grantee: grantee.publicKey,
          granteeToken: ata(grantee.publicKey),
          usdcTokenProgram: USDC_PROGRAM,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([grantee])
        .rpc(),
      "ConstraintHasOne"
    );
  });

  it("rejects init_grant when the CashRules mint authority is not the grant PDA", async () => {
    const badMint = Keypair.generate();
    await createHookMint(badMint, issuer.publicKey); // issuer, not the grant PDA
    const badGrant = pda([Buffer.from("grant"), badMint.publicKey.toBuffer()]);
    const badVault = getAssociatedTokenAddressSync(usdcMint, badGrant, true, USDC_PROGRAM);
    await expectRevert(
      program.methods
        .initGrant(ALLOWED, DAILY_CAP)
        .accounts({
          issuer: issuer.publicKey,
          mint: badMint.publicKey,
          usdcMint,
          grant: badGrant,
          vault: badVault,
          usdcTokenProgram: USDC_PROGRAM,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
      "MintAuthorityMismatch"
    );
  });

  // ------------------------------------------------------------ spend rules

  it("allows a payment to an approved merchant within caps", async () => {
    await transferCashRules(grantee, ata(merchant.publicKey), usd(150));
    const bal = await getAccount(connection, ata(merchant.publicKey), "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(bal.amount.toString()).to.equal(usd(150).toString());
    const spend = await program.account.spend.fetch(spendPda(grantee.publicKey));
    expect(spend.spentToday.toString()).to.equal(usd(150).toString());
  });

  it("blocks a transfer to a non-merchant wallet", async () => {
    await expectRevert(transferCashRules(grantee, ata(stranger.publicKey), usd(10)), "NotApprovedMerchant");
  });

  it("blocks a payment above the merchant per-tx cap", async () => {
    await expectRevert(transferCashRules(grantee, ata(merchant.publicKey), usd(300)), "OverTxCap");
  });

  it("blocks a merchant whose category the grant does not allow", async () => {
    await expectRevert(transferCashRules(grantee, ata(merchantOther.publicKey), usd(10)), "CategoryBlocked");
  });

  it("enforces the daily cap per grantee", async () => {
    // spent 150 so far; 200 more is 350 (ok), another 200 is 550 (over 500)
    await transferCashRules(grantee, ata(merchant.publicKey), usd(200));
    await expectRevert(transferCashRules(grantee, ata(merchant.publicKey), usd(200)), "OverDailyCap");
  });

  it("tracks the daily cap separately per grantee", async () => {
    // grantee is at its cap; grantee2 has its own counter.
    await transferCashRules(grantee2, ata(merchant.publicKey), usd(200));
    const spend = await program.account.spend.fetch(spendPda(grantee2.publicKey));
    expect(spend.spentToday.toString()).to.equal(usd(200).toString());
  });

  it("blocks payments to a merchant that has been deactivated", async () => {
    await program.methods
      .setMerchant(merchant.publicKey, CAT_FOOD, usd(200), false)
      .accounts({ issuer: issuer.publicKey, mint: mint.publicKey, grant: grantPda, merchant: merchantPda(merchant.publicKey) })
      .rpc();
    await expectRevert(transferCashRules(grantee2, ata(merchant.publicKey), usd(10)), "NotApprovedMerchant");
    // Deactivated merchants cannot redeem either.
    await expectRevert(redeem(merchant, usd(1)), "NotApprovedMerchant");

    await program.methods
      .setMerchant(merchant.publicKey, CAT_FOOD, usd(200), true)
      .accounts({ issuer: issuer.publicKey, mint: mint.publicKey, grant: grantPda, merchant: merchantPda(merchant.publicKey) })
      .rpc();
  });

  it("allows a payment again after the merchant is reactivated", async () => {
    await transferCashRules(grantee2, ata(merchant.publicKey), usd(25));
  });

  it("rejects a non-issuer trying to add a merchant", async () => {
    const target = Keypair.generate();
    await expectRevert(
      program.methods
        .addMerchant(target.publicKey, CAT_FOOD, usd(100))
        .accounts({
          issuer: grantee2.publicKey,
          mint: mint.publicKey,
          grant: grantPda,
          merchant: merchantPda(target.publicKey),
        })
        .signers([grantee2])
        .rpc(),
      "ConstraintHasOne"
    );
  });

  // ------------------------------------------------------------ redeem

  it("approved merchant redeems CashRules 1:1 for USDC", async () => {
    const vaultBefore = (await getAccount(connection, vaultPda, "confirmed", USDC_PROGRAM)).amount;
    const usdcBefore = (await getAccount(connection, usdcAta(merchant.publicKey), "confirmed", USDC_PROGRAM)).amount;
    const rcBefore = (await getAccount(connection, ata(merchant.publicKey), "confirmed", TOKEN_2022_PROGRAM_ID)).amount;

    await redeem(merchant, usd(100));

    const vaultAfter = (await getAccount(connection, vaultPda, "confirmed", USDC_PROGRAM)).amount;
    const usdcAfter = (await getAccount(connection, usdcAta(merchant.publicKey), "confirmed", USDC_PROGRAM)).amount;
    const rcAfter = (await getAccount(connection, ata(merchant.publicKey), "confirmed", TOKEN_2022_PROGRAM_ID)).amount;

    expect((vaultBefore - vaultAfter).toString()).to.equal(usd(100).toString());
    expect((usdcAfter - usdcBefore).toString()).to.equal(usd(100).toString());
    expect((rcBefore - rcAfter).toString()).to.equal(usd(100).toString());
  });

  it("grantee cannot redeem CashRules for USDC (not an approved merchant)", async () => {
    await expectRevert(redeem(grantee, usd(10)), "NotApprovedMerchant");
  });

  it("keeps CashRules supply fully backed by the vault", async () => {
    const supply = (await getMint(connection, mint.publicKey, "confirmed", TOKEN_2022_PROGRAM_ID)).supply;
    const vault = (await getAccount(connection, vaultPda, "confirmed", USDC_PROGRAM)).amount;
    expect(vault.toString()).to.equal(supply.toString());
  });

  // ------------------------------------------------------------ exceptions

  // Escrow is the issuer's RuleCash account. Forfeits go to a separate treasury account.
  const escrowAta = () => ata(issuer.publicKey);
  const treasury = Keypair.generate();

  const exceptionPda = (id: number) => {
    const idBuf = Buffer.alloc(8);
    idBuf.writeBigUInt64LE(BigInt(id));
    return pda([Buffer.from("exception"), mint.publicKey.toBuffer(), idBuf]);
  };

  // Payer request, one transaction: transfer into escrow, then record the request with its reason.
  async function requestWithTransfer(payer: Keypair, id: number, merchantWallet: PublicKey, amount: number, reason: string) {
    const transferIx = await createTransferCheckedWithTransferHookInstruction(
      connection, ata(payer.publicKey), mint.publicKey, escrowAta(), payer.publicKey,
      BigInt(Math.round(amount * 10 ** DECIMALS)), DECIMALS, [], "confirmed", TOKEN_2022_PROGRAM_ID
    );
    const recordIx = await program.methods
      .requestException(merchantWallet, usd(amount), reason)
      .accounts({
        payer: payer.publicKey,
        mint: mint.publicKey,
        grant: grantPda,
        escrowToken: escrowAta(),
        exception: exceptionPda(id),
      } as any)
      .instruction();
    return provider.sendAndConfirm(new Transaction().add(transferIx, recordIx), [payer]);
  }

  // Issuer decision, one transaction: record approve/reject, then move the escrowed funds.
  async function decideWithTransfer(method: "approveException" | "rejectException", id: number, destinationWallet: PublicKey, amount: number) {
    const recordIx = await (program.methods as any)[method](new BN(id))
      .accounts({ issuer: issuer.publicKey, mint: mint.publicKey, grant: grantPda, exception: exceptionPda(id) })
      .instruction();
    const transferIx = await createTransferCheckedWithTransferHookInstruction(
      connection, escrowAta(), mint.publicKey, ata(destinationWallet), issuer.publicKey,
      BigInt(Math.round(amount * 10 ** DECIMALS)), DECIMALS, [], "confirmed", TOKEN_2022_PROGRAM_ID
    );
    return provider.sendAndConfirm(new Transaction().add(recordIx, transferIx), []);
  }

  it("payer requests an out-of-policy payment: funds go to escrow and the reason is recorded", async () => {
    const payerBefore = await bal(ata(grantee.publicKey));
    const escrowBefore = await bal(escrowAta());
    await requestWithTransfer(grantee, 0, merchantOther.publicKey, 30, "Team lunch at a vendor not on the list");
    expect(await bal(ata(grantee.publicKey))).to.equal(payerBefore - 30);
    expect(await bal(escrowAta())).to.equal(escrowBefore + 30);
    const ex = await program.account.exception.fetch(exceptionPda(0));
    expect(ex.status).to.equal(0);
    expect(ex.amount.toString()).to.equal(usd(30).toString());
    expect(Buffer.from(ex.reason.slice(0, ex.reasonLen)).toString()).to.equal("Team lunch at a vendor not on the list");
  });

  it("issuer approves: escrowed funds go to the requested wallet", async () => {
    const merchantBefore = await bal(ata(merchantOther.publicKey));
    const escrowBefore = await bal(escrowAta());
    await decideWithTransfer("approveException", 0, merchantOther.publicKey, 30);
    expect(await bal(ata(merchantOther.publicKey))).to.equal(merchantBefore + 30);
    expect(await bal(escrowAta())).to.equal(escrowBefore - 30);
    expect((await program.account.exception.fetch(exceptionPda(0))).status).to.equal(1);
  });

  it("issuer rejects: escrowed funds are forfeited to the treasury, so the payer stays charged", async () => {
    const payerBefore = await bal(ata(grantee.publicKey));
    await requestWithTransfer(grantee, 1, stranger.publicKey, 20, "Gift for a vendor who is not approved yet");
    expect(await bal(ata(grantee.publicKey))).to.equal(payerBefore - 20);
    await decideWithTransfer("rejectException", 1, treasury.publicKey, 20);
    expect(await bal(ata(treasury.publicKey))).to.equal(20);
    expect(await bal(ata(grantee.publicKey))).to.equal(payerBefore - 20);
    expect((await program.account.exception.fetch(exceptionPda(1))).status).to.equal(2);
  });

  it("only the issuer can decide an exception", async () => {
    await requestWithTransfer(grantee, 2, merchantOther.publicKey, 5, "Second request");
    let failed = false;
    try {
      await (program.methods as any).approveException(new BN(2))
        .accounts({ issuer: grantee.publicKey, mint: mint.publicKey, grant: grantPda, exception: exceptionPda(2) })
        .signers([grantee])
        .rpc();
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
    expect((await program.account.exception.fetch(exceptionPda(2))).status).to.equal(0);
  });

  it("a decided exception cannot be decided again", async () => {
    let failed = false;
    try {
      await decideWithTransfer("approveException", 1, merchantOther.publicKey, 20);
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });

  it("normal payments still follow the spend rules: a blocked category still fails", async () => {
    await expectRevert(transferCashRules(grantee, ata(merchantOther.publicKey), usd(1)), "CategoryBlocked");
  });
});
