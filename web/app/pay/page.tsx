"use client";

import { useEffect, useMemo, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedWithTransferHookInstruction,
  getAccount,
} from "@solana/spl-token";
import {
  CATEGORY_NAMES,
  DEMO,
  RULECASH_DECIMALS,
  connection,
  rcAta,
  loadSpentToday,
} from "../../lib/chain";

// Minimal injected-wallet type (Phantom and most Solana wallets expose window.solana).
type InjectedWallet = {
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey: PublicKey }>;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
};

function getWallet(): InjectedWallet | null {
  const w = window as any;
  return (w.phantom?.solana ?? w.solana ?? null) as InjectedWallet | null;
}

// Pull the first "Error Code: X" from a failed send, or fall back to the message.
function explainError(e: any): string {
  const text = [String(e?.message ?? e), ...(e?.logs ?? [])].join("\n");
  const m = text.match(/Error Code: (\w+)/);
  return m ? `Rejected on-chain: ${m[1]}` : `Failed: ${e?.message ?? String(e)}`;
}

export default function Pay() {
  const [owner, setOwner] = useState<PublicKey | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [spentToday, setSpentToday] = useState<number | null>(null);
  const [merchantWallet, setMerchantWallet] = useState(DEMO.merchants[0]?.wallet ?? "");
  const [amount, setAmount] = useState("25");
  const [status, setStatus] = useState<{ kind: "ok" | "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasWallet, setHasWallet] = useState(true);

  useEffect(() => {
    setHasWallet(getWallet() !== null);
  }, []);

  const merchant = useMemo(
    () => DEMO.merchants.find((m) => m.wallet === merchantWallet),
    [merchantWallet]
  );

  async function refreshBalance(who: PublicKey) {
    try {
      const acct = await getAccount(connection, rcAta(who), "confirmed", TOKEN_2022_PROGRAM_ID);
      setBalance(Number(acct.amount) / 10 ** RULECASH_DECIMALS);
      setSpentToday(await loadSpentToday(who));
    } catch {
      setBalance(0);
    }
  }

  async function connectWallet() {
    const w = getWallet();
    if (!w) {
      setStatus({ kind: "bad", text: "No Solana wallet found. Install Phantom and set its network to the demo cluster." });
      return;
    }
    try {
      const { publicKey } = await w.connect();
      setOwner(publicKey);
      await refreshBalance(publicKey);
    } catch (e: any) {
      setStatus({ kind: "bad", text: `Wallet connect failed: ${e?.message ?? e}` });
    }
  }

  async function pay() {
    const w = getWallet();
    if (!w || !owner || !merchant) return;
    const value = Number(amount);
    if (!(value > 0)) {
      setStatus({ kind: "bad", text: "Enter an amount greater than 0." });
      return;
    }
    setBusy(true);
    setStatus({ kind: "info", text: "Building transaction…" });
    try {
      const dest = new PublicKey(merchant.wallet);
      const ix = await createTransferCheckedWithTransferHookInstruction(
        connection,
        rcAta(owner),
        new PublicKey(DEMO.rulecashMint),
        rcAta(dest),
        owner,
        BigInt(Math.round(value * 10 ** RULECASH_DECIMALS)),
        RULECASH_DECIMALS,
        [],
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      const tx = new Transaction().add(ix);
      tx.feePayer = owner;
      tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;

      setStatus({ kind: "info", text: "Waiting for signature…" });
      const signed = await w.signTransaction(tx);
      // skipPreflight: a rule violation must land on-chain so it shows in the live feed as blocked.
      const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
      setStatus({ kind: "info", text: `Confirming ${sig.slice(0, 8)}…` });
      const result = await connection.confirmTransaction(sig, "confirmed");
      if (result.value.err) {
        // confirmTransaction does not throw on a failed transaction: read the error from the logs.
        const tx2 = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
        const code = (tx2?.meta?.logMessages ?? []).join("\n").match(/Error Code: (\w+)/)?.[1];
        setStatus({ kind: "bad", text: `✗ Blocked on-chain: ${code ?? "transaction failed"}. It shows in the live feed.` });
      } else {
        setStatus({ kind: "ok", text: `✓ Paid ${value} to ${merchant.name}.` });
      }
      await refreshBalance(owner);
    } catch (e: any) {
      setStatus({ kind: "bad", text: `✗ ${explainError(e)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Pay with RuleCash</h1>
      <p className="muted">
        Payments succeed only at approved merchants, within the merchant cap and your daily cap. Anything else is
        rejected by the chain.
      </p>

      {!hasWallet && (
        <div className="card bad">No Solana wallet detected. Install Phantom to pay.</div>
      )}

      <div className="card">
        {!owner ? (
          <button onClick={connectWallet} disabled={!hasWallet}>
            Connect wallet
          </button>
        ) : (
          <p>
            Connected <span className="mono">{owner.toBase58()}</span>
            <br />
            Balance: <strong>{balance === null ? "…" : balance.toLocaleString()} RuleCash</strong>
            {" · "}Daily cap left:{" "}<strong>{spentToday === null ? "…" : Math.max(0, DEMO.dailyCap - spentToday).toLocaleString()} of {DEMO.dailyCap.toLocaleString()}</strong>
          </p>
        )}
      </div>

      <div className="card">
        <div className="row">
          <div>
            <label className="muted" htmlFor="merchant">Merchant</label>
            <select id="merchant" value={merchantWallet} onChange={(e) => setMerchantWallet(e.target.value)}>
              {DEMO.merchants.map((m) => (
                <option key={m.wallet} value={m.wallet}>
                  {m.name} ({CATEGORY_NAMES[m.category] ?? m.category}){m.blockedByGrant ? " — not allowed by grant" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="muted" htmlFor="amount">Amount (RuleCash)</label>
            <input id="amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <p className="muted">
          {merchant ? `Per-tx cap for this merchant: ${merchant.perTxCap}.` : ""}
        </p>
        <button onClick={pay} disabled={!owner || busy || !merchant}>
          {busy ? "Paying…" : "Pay"}
        </button>
      </div>

      {status && (
        <div className={`card ${status.kind === "ok" ? "ok" : status.kind === "bad" ? "bad" : "muted"}`}>
          {status.text}
        </div>
      )}
    </>
  );
}
