import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import idlJson from "./cashrules.json";
import type { Cashrules } from "./cashrules.types";
import { connection } from "./chain";

// Minimal injected-wallet surface (Phantom and most Solana wallets expose window.solana / window.phantom.solana).
export type InjectedWallet = {
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey: PublicKey }>;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAllTransactions: (txs: Transaction[]) => Promise<Transaction[]>;
  disconnect?: () => Promise<void>;
};

export function getInjected(): InjectedWallet | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return (w.phantom?.solana ?? w.solana ?? null) as InjectedWallet | null;
}

// Anchor program bound to the connected wallet, so it can sign admin and merchant transactions.
export function walletProgram(w: InjectedWallet, owner: PublicKey) {
  const wallet = {
    publicKey: owner,
    signTransaction: (tx: any) => w.signTransaction(tx),
    signAllTransactions: (txs: any[]) => w.signAllTransactions(txs),
  } as unknown as anchor.Wallet;
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return new anchor.Program<Cashrules>(idlJson as Cashrules, provider);
}

// Pull the on-chain error name out of a failed send or simulation.
export function errorName(e: any): string {
  const text = [String(e?.message ?? e), ...(e?.logs ?? [])].join("\n");
  return text.match(/Error Code: (\w+)/)?.[1] ?? describeError(e);
}

// Readable text for any thrown value. Wallets and RPC clients don't always throw Error instances.
export function describeError(e: any): string {
  if (!e) return "unknown error";
  if (typeof e === "string") return e;
  if (e.message) return String(e.message);
  if (e.error?.message) return String(e.error.message);
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
