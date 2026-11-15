import { BN, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token";
import type { Rulecash } from "./rulecash.types";
import {
  GRANT,
  PROGRAM_ID,
  MINT,
  RULECASH_DECIMALS,
  USDC_MINT,
  USDC_PROGRAM,
  VAULT,
  merchantPda,
  rcAta,
  spendPda,
  usdcAta,
} from "./chain";

// Transaction builders shared by the web pages and scripts/web-smoke.ts.
// Each returns an unsigned Transaction. Callers set blockhash and fee payer (prepare), sign, then send (sendSigned).

export type Program_ = Program<Rulecash>;

export const toBase = (n: number) => new BN(Math.round(n * 10 ** RULECASH_DECIMALS));

// Fill fee payer and a recent blockhash.
export async function prepare(conn: Connection, tx: Transaction, feePayer: PublicKey): Promise<Transaction> {
  tx.feePayer = feePayer;
  tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;
  return tx;
}

// Grantee pays a merchant. Creates the merchant's RuleCash account first.
//
// The transfer hook's extra accounts are built here from the PDA seeds, not with
// createTransferCheckedWithTransferHookInstruction. That helper reads the destination account at build time, so it
// fails when the merchant's account does not exist yet, even though this transaction creates it.
// Account order matches @solana/spl-token's addExtraAccountMetasForExecute: transfer accounts, then the extra
// accounts in the validation order (grant, merchant, spend), then the hook program, then the validation account.
export function buildPay(owner: PublicKey, merchant: PublicKey, amount: number): Transaction {
  const ix = createTransferCheckedInstruction(
    rcAta(owner),
    MINT,
    rcAta(merchant),
    owner,
    BigInt(toBase(amount).toString()),
    RULECASH_DECIMALS,
    [],
    TOKEN_2022_PROGRAM_ID
  );
  const validationAccount = PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), MINT.toBuffer()],
    PROGRAM_ID
  )[0];
  ix.keys.push(
    { pubkey: GRANT, isSigner: false, isWritable: false },
    { pubkey: merchantPda(merchant), isSigner: false, isWritable: false },
    { pubkey: spendPda(owner), isSigner: false, isWritable: true },
    { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: validationAccount, isSigner: false, isWritable: false }
  );
  const ataIx = createAssociatedTokenAccountIdempotentInstruction(
    owner,
    rcAta(merchant),
    merchant,
    MINT,
    TOKEN_2022_PROGRAM_ID
  );
  return new Transaction().add(ataIx, ix);
}

// Approved merchant redeems RuleCash for USDC from the vault.
export function buildRedeem(program: Program_, merchant: PublicKey, amount: number) {
  return program.methods
    .redeem(toBase(amount))
    .accountsPartial({
      merchant,
      mint: MINT,
      usdcMint: USDC_MINT,
      grant: GRANT,
      merchantAccount: merchantPda(merchant),
      merchantRulecash: rcAta(merchant),
      merchantUsdc: usdcAta(merchant),
      vault: VAULT,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      usdcTokenProgram: USDC_PROGRAM,
    })
    .preInstructions([
      createAssociatedTokenAccountIdempotentInstruction(merchant, usdcAta(merchant), merchant, USDC_MINT, USDC_PROGRAM),
    ])
    .transaction();
}

export function buildAddMerchant(program: Program_, issuer: PublicKey, merchant: PublicKey, category: number, perTxCap: number) {
  return program.methods
    .addMerchant(merchant, category, toBase(perTxCap))
    .accountsPartial({ issuer, mint: MINT, grant: GRANT, merchant: merchantPda(merchant) })
    .transaction();
}

// Re-sends the merchant's current category and cap with a new active flag.
export function buildSetMerchant(
  program: Program_,
  issuer: PublicKey,
  merchant: PublicKey,
  category: number,
  perTxCap: number,
  active: boolean
) {
  return program.methods
    .setMerchant(merchant, category, toBase(perTxCap), active)
    .accountsPartial({ issuer, mint: MINT, grant: GRANT, merchant: merchantPda(merchant) })
    .transaction();
}

export function buildSetPolicy(program: Program_, issuer: PublicKey, allowedCategories: number, dailyCap: number) {
  return program.methods
    .setPolicy(allowedCategories, toBase(dailyCap))
    .accountsPartial({ issuer, mint: MINT, grant: GRANT })
    .transaction();
}

// Lock USDC and mint RuleCash to a grantee. Creates the grantee's accounts in the same transaction when missing.
export async function buildFundGrantee(
  program: Program_,
  issuer: PublicKey,
  grantee: PublicKey,
  amount: number,
  needsSpend: boolean
): Promise<Transaction> {
  const pre = [
    createAssociatedTokenAccountIdempotentInstruction(issuer, rcAta(grantee), grantee, MINT, TOKEN_2022_PROGRAM_ID),
  ];
  if (needsSpend) {
    pre.push(
      await program.methods
        .initSpend(grantee)
        .accountsPartial({ payer: issuer, mint: MINT, spend: spendPda(grantee) })
        .instruction()
    );
  }
  return program.methods
    .depositAndMint(toBase(amount))
    .accountsPartial({
      issuer,
      mint: MINT,
      usdcMint: USDC_MINT,
      grant: GRANT,
      issuerUsdc: usdcAta(issuer),
      vault: VAULT,
      grantee,
      granteeToken: rcAta(grantee),
      usdcTokenProgram: USDC_PROGRAM,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .preInstructions(pre)
    .transaction();
}

export type SendResult = { signature: string; error: string | null };

// Pull the on-chain error name from a failed transaction's logs.
export async function errorFromChain(conn: Connection, signature: string): Promise<string> {
  // RPC nodes can lag a moment behind confirmation, so retry the lookup briefly.
  let info: Awaited<ReturnType<Connection["getTransaction"]>> = null;
  for (let i = 0; i < 8 && !info; i++) {
    info = await conn.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!info) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!info) return "transaction failed (details not available yet)";
  const logs = (info.meta?.logMessages ?? []).join("\n");
  const name = logs.match(/Error Code: (\w+)/)?.[1];
  if (name) return name;
  return info.meta?.err ? JSON.stringify(info.meta.err) : "transaction failed";
}

// Send an already-signed transaction and wait for confirmation.
// `skipPreflight` lets rule violations land on-chain so they appear in the live feed as blocked.
// Preflight failures throw. A failed transaction can come back either as value.err or as a thrown error,
// depending on the web3.js version, so both are read the same way: the on-chain error name from the logs.
export async function sendSigned(conn: Connection, signed: Transaction, skipPreflight: boolean): Promise<SendResult> {
  const signature = await conn.sendRawTransaction(signed.serialize(), { skipPreflight });
  try {
    const res = await conn.confirmTransaction(signature, "confirmed");
    if (!res.value.err) return { signature, error: null };
  } catch (e: any) {
    // Timeouts are not failures: let them through so the caller can say the outcome is unknown.
    const text = JSON.stringify(e?.message ?? e ?? "");
    if (/expired|block height/i.test(text)) throw e;
  }
  return { signature, error: await errorFromChain(conn, signature) };
}
